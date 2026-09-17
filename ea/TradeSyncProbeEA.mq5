//+------------------------------------------------------------------+
//|                                       TradeSyncProbeEA.mq5       |
//|                         TradeSync API v2 synchronization probe  |
//+------------------------------------------------------------------+
#property copyright "TradeEZ"
#property version   "2.00"
#property strict

input group "TradeSync API v2"
input string Inp_BaseUrl              = "https://192.168.31.116:8443";
input string Inp_SyncKey              = "";   // sk_live_... from web console
input int    Inp_HistoryDays          = 7;
input int    Inp_TimerSeconds         = 3;
input int    Inp_BatchSize            = 500;
input bool   Inp_SendSymbolSpec       = true;
input int    Inp_SnapshotIntervalSec  = 30;
input int    Inp_HeartbeatIntervalSec = 300;

string   g_baseUrl = "";
bool     g_initialSyncDone = false;
long     g_lastSyncTime = -1;
bool     g_symbolSpecSent = false;
datetime g_lastSnapshotTime = 0;
datetime g_lastHeartbeatTime = 0;

int OnInit()
{
   if(StringLen(Inp_SyncKey) == 0)
   {
      Print("[TradeSync][ERROR] Inp_SyncKey is empty. Generate a key in the web console and set it in EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(Inp_BatchSize < 1 || Inp_BatchSize > 1000)
   {
      Print("[TradeSync][ERROR] Inp_BatchSize must be between 1 and 1000.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   g_baseUrl = TrimTrailingSlash(Inp_BaseUrl);
   EventSetTimer(MathMax(1, Inp_TimerSeconds));
   PrintFormat("[TradeSync] API v2 probe started. URL=%s", g_baseUrl);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   PrintFormat("[TradeSync] Stopped, reason=%d", reason);
}

void OnTimer()
{
   if(!g_initialSyncDone)
      InitialSync();
   else
      SendIncrementalDeals();

   // Do not send auxiliary data until the account has authenticated and deal sync can run.
   if(!g_initialSyncDone)
      return;

   if(Inp_SendSymbolSpec && !g_symbolSpecSent)
      g_symbolSpecSent = SendSymbolSpec();

   SendSnapshotDue();
   SendHeartbeatDue();
}

void InitialSync()
{
   if(!FetchLastSyncTime())
      return;

   datetime fromTime;
   if(g_lastSyncTime > 0)
      fromTime = (datetime)MathMax(0, g_lastSyncTime - 5);
   else
      fromTime = TimeCurrent() - (datetime)(MathMax(1, Inp_HistoryDays) * 86400);

   if(SendDealsFrom(fromTime))
   {
      g_initialSyncDone = true;
      PrintFormat("[TradeSync] Initial sync completed. lastSyncTime=%I64d", g_lastSyncTime);
   }
}

void SendIncrementalDeals()
{
   datetime fromTime;
   if(g_lastSyncTime > 0)
      fromTime = (datetime)MathMax(0, g_lastSyncTime - 5);
   else
      fromTime = TimeCurrent() - (datetime)(MathMax(1, Inp_HistoryDays) * 86400);

   SendDealsFrom(fromTime);
}

bool FetchLastSyncTime()
{
   const long login = GetLogin();
   string body = StringFormat("{\"mt5_login\":%I64d}", login);
   string response = "";

   if(!PostJson("/api/v1/sync/last_sync_time", body, response))
      return(false);

   long lastSyncTime = 0;
   if(!JsonExtractLong(response, "last_sync_time", lastSyncTime))
   {
      PrintFormat("[TradeSync][ERROR] last_sync_time not found in response: %s", response);
      return(false);
   }

   g_lastSyncTime = lastSyncTime;
   PrintFormat("[TradeSync] Fetched last_sync_time=%I64d", g_lastSyncTime);
   return(true);
}

bool SendDealsFrom(datetime fromTime)
{
   const datetime toTime = TimeCurrent() + 60;
   if(!HistorySelect(fromTime, toTime))
   {
      PrintFormat("[TradeSync][ERROR] HistorySelect(%I64d,%I64d) failed, error=%d",
                  (long)fromTime, (long)toTime, GetLastError());
      return(false);
   }

   const int totalDeals = HistoryDealsTotal();
   ulong tickets[];
   int dealCount = 0;

   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;

      if(!IsTradeDeal(ticket))
         continue;

      ArrayResize(tickets, dealCount + 1);
      tickets[dealCount] = ticket;
      dealCount++;
   }

   if(dealCount == 0)
   {
      // No API call is needed when there are no new trade deals. Re-scan uses ticket idempotency.
      return(true);
   }

   const int batchSize = MathMax(1, MathMin(1000, Inp_BatchSize));
   for(int offset = 0; offset < dealCount; offset += batchSize)
   {
      string dealsJson = "";
      long batchLastDealTime = 0;
      const int end = MathMin(dealCount, offset + batchSize);

      for(int i = offset; i < end; i++)
      {
         if(StringLen(dealsJson) > 0)
            dealsJson += ",";
         dealsJson += DealToV2Json(tickets[i]);

         long dealTime = HistoryDealGetInteger(tickets[i], DEAL_TIME);
         if(dealTime > batchLastDealTime)
            batchLastDealTime = dealTime;
      }

      string body = StringFormat(
         "{\"mt5_login\":%I64d,\"server_gmt_off\":%I64d,\"last_deal_time\":%I64d,\"deals\":[%s]}",
         GetLogin(), GetServerGmtOffset(), batchLastDealTime, dealsJson);

      string response = "";
      if(!PostJson("/api/v1/ingest/deals", body, response))
         return(false);

      long updated = 0;
      if(!JsonExtractLong(response, "last_sync_time_updated", updated))
      {
         PrintFormat("[TradeSync][ERROR] last_sync_time_updated not found in response: %s", response);
         return(false);
      }

      if(updated > g_lastSyncTime)
         g_lastSyncTime = updated;

      long inserted = 0;
      long duplicates = 0;
      JsonExtractLong(response, "inserted", inserted);
      JsonExtractLong(response, "duplicates", duplicates);
      PrintFormat("[TradeSync] Deals batch accepted: count=%d inserted=%I64d duplicates=%I64d lastSyncTime=%I64d",
                  end - offset, inserted, duplicates, g_lastSyncTime);
   }

   return(true);
}

bool IsTradeDeal(const ulong ticket)
{
   const long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      return(false);

   const long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   if(entryType != DEAL_ENTRY_IN &&
      entryType != DEAL_ENTRY_OUT &&
      entryType != DEAL_ENTRY_INOUT)
      return(false);

   const string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   if(StringLen(symbol) == 0)
      return(false);

   const double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   const double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
   if(volume <= 0.0 || price <= 0.0)
      return(false);

   return(true);
}

string DealToV2Json(const ulong ticket)
{
   const ulong orderTicket = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);
   const ulong positionId = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   const long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
   const long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   const long dealTime = HistoryDealGetInteger(ticket, DEAL_TIME);
   const long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   const string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   const string comment = HistoryDealGetString(ticket, DEAL_COMMENT);

   string dealTypeText = "SELL";
   if(dealType == DEAL_TYPE_BUY)
      dealTypeText = "BUY";

   string entryTypeText = "INOUT";
   if(entryType == DEAL_ENTRY_IN)
      entryTypeText = "IN";
   else if(entryType == DEAL_ENTRY_OUT)
      entryTypeText = "OUT";

   double sl = 0.0;
   double tp = 0.0;
   GetDealStopLevels(ticket, positionId, sl, tp);

   return(StringFormat(
      "{\"deal_ticket\":%I64u,\"order_ticket\":%I64u,\"position_id\":%I64u,"\
      "\"symbol\":\"%s\",\"deal_type\":\"%s\",\"entry_type\":\"%s\",\"deal_time\":%I64d,"\
      "\"price\":%s,\"volume\":%s,\"commission\":%s,\"swap\":%s,\"profit\":%s,"\
      "\"sl\":%s,\"tp\":%s,\"comment\":\"%s\",\"magic\":%I64d}",
      ticket, orderTicket, positionId,
      JsonString(symbol), dealTypeText, entryTypeText, dealTime,
      DoubleToJson(HistoryDealGetDouble(ticket, DEAL_PRICE)),
      DoubleToJson(HistoryDealGetDouble(ticket, DEAL_VOLUME)),
      DoubleToJson(HistoryDealGetDouble(ticket, DEAL_COMMISSION)),
      DoubleToJson(HistoryDealGetDouble(ticket, DEAL_SWAP)),
      DoubleToJson(HistoryDealGetDouble(ticket, DEAL_PROFIT)),
      DoubleToJson(sl), DoubleToJson(tp),
      JsonString(comment), magic));
}

void GetDealStopLevels(const ulong ticket, const ulong positionId, double &sl, double &tp)
{
   sl = 0.0;
   tp = 0.0;

   const ulong orderTicket = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);
   if(orderTicket != 0)
   {
      sl = NormalizeZero(HistoryOrderGetDouble(orderTicket, ORDER_SL));
      tp = NormalizeZero(HistoryOrderGetDouble(orderTicket, ORDER_TP));
      if(sl > 0.0 || tp > 0.0)
         return;
   }

   if(PositionSelectByTicket(positionId))
   {
      sl = NormalizeZero(PositionGetDouble(POSITION_SL));
      tp = NormalizeZero(PositionGetDouble(POSITION_TP));
      if(sl > 0.0 || tp > 0.0)
         return;
   }

   // For an already closed OUT deal, try to recover stop levels from the matching IN deal.
   const long thisEntry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   if(thisEntry == DEAL_ENTRY_OUT || thisEntry == DEAL_ENTRY_INOUT)
   {
      const int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
      {
         ulong otherTicket = HistoryDealGetTicket(i);
         if(otherTicket == 0)
            continue;

         const ulong otherPosition = (ulong)HistoryDealGetInteger(otherTicket, DEAL_POSITION_ID);
         const long otherEntry = HistoryDealGetInteger(otherTicket, DEAL_ENTRY);
         if(otherPosition != positionId ||
            (otherEntry != DEAL_ENTRY_IN && otherEntry != DEAL_ENTRY_INOUT))
            continue;

         const ulong otherOrder = (ulong)HistoryDealGetInteger(otherTicket, DEAL_ORDER);
         if(otherOrder != 0)
         {
            sl = NormalizeZero(HistoryOrderGetDouble(otherOrder, ORDER_SL));
            tp = NormalizeZero(HistoryOrderGetDouble(otherOrder, ORDER_TP));
         }
         return;
      }
   }
}

bool SendSymbolSpec()
{
   string names[];
   int count = 0;

   AddSymbolName(names, count, _Symbol);

   const int visibleTotal = SymbolsTotal(true);
   for(int i = 0; i < visibleTotal && count < 100; i++)
   {
      string name = SymbolName(i, true);
      AddSymbolName(names, count, name);
   }

   string itemsJson = "";
   int sentCount = 0;

   for(int i = 0; i < count; i++)
   {
      string name = names[i];
      const long digitsLong = SymbolInfoInteger(name, SYMBOL_DIGITS);
      const double point = SymbolInfoDouble(name, SYMBOL_POINT);
      const double contractSize = SymbolInfoDouble(name, SYMBOL_TRADE_CONTRACT_SIZE);
      const double tickValue = SymbolInfoDouble(name, SYMBOL_TRADE_TICK_VALUE);
      const double tickSize = SymbolInfoDouble(name, SYMBOL_TRADE_TICK_SIZE);
      const string currencyBase = SymbolInfoString(name, SYMBOL_CURRENCY_BASE);
      const string currencyProfit = SymbolInfoString(name, SYMBOL_CURRENCY_PROFIT);

      if(digitsLong < 0 || digitsLong > 8 || point <= 0.0 || contractSize <= 0.0 ||
         tickValue <= 0.0 || tickSize <= 0.0 ||
         StringLen(currencyBase) == 0 || StringLen(currencyProfit) == 0)
         continue;

      if(StringLen(itemsJson) > 0)
         itemsJson += ",";

      itemsJson += StringFormat(
         "{\"symbol\":\"%s\",\"digits\":%d,\"point\":%s,\"contract_size\":%s,"\
         "\"tick_value\":%s,\"tick_size\":%s,\"currency_base\":\"%s\",\"currency_profit\":\"%s\"}",
         JsonString(name), (int)digitsLong, DoubleToJson(point), DoubleToJson(contractSize),
         DoubleToJson(tickValue), DoubleToJson(tickSize),
         JsonString(currencyBase), JsonString(currencyProfit));
      sentCount++;
   }

   if(sentCount == 0)
   {
      Print("[TradeSync][ERROR] No valid symbol specification could be read.");
      return(false);
   }

   string body = StringFormat("{\"mt5_login\":%I64d,\"symbols\":[%s]}", GetLogin(), itemsJson);
   string response = "";
   if(!PostJson("/api/v1/ingest/symbols", body, response))
      return(false);

   long accepted = 0;
   if(!JsonExtractLong(response, "accepted", accepted) || accepted <= 0)
   {
      PrintFormat("[TradeSync][ERROR] Symbol ingestion failed, response=%s", response);
      return(false);
   }

   PrintFormat("[TradeSync] Symbol specifications upserted: %I64d", accepted);
   return(true);
}

void SendSnapshotDue()
{
   const int interval = MathMax(1, Inp_SnapshotIntervalSec);
   if(TimeCurrent() - g_lastSnapshotTime < interval && g_lastSnapshotTime != 0)
      return;

   string body = StringFormat(
      "{\"mt5_login\":%I64d,\"timestamp\":%I64d,\"balance\":%s,\"equity\":%s,"\
      "\"margin\":%s,\"free_margin\":%s,\"margin_level\":%s}",
      GetLogin(), (long)TimeCurrent(),
      DoubleToJson(AccountInfoDouble(ACCOUNT_BALANCE)),
      DoubleToJson(AccountInfoDouble(ACCOUNT_EQUITY)),
      DoubleToJson(AccountInfoDouble(ACCOUNT_MARGIN)),
      DoubleToJson(AccountInfoDouble(ACCOUNT_MARGIN_FREE)),
      DoubleToJson(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL)));

   string response = "";
   if(!PostJson("/api/v1/ingest/snapshot", body, response))
      return;

   bool accepted = false;
   if(!JsonExtractBool(response, "accepted", accepted) || !accepted)
   {
      PrintFormat("[TradeSync][ERROR] Snapshot not accepted: %s", response);
      return;
   }

   g_lastSnapshotTime = TimeCurrent();
   Print("[TradeSync] Account snapshot sent.");
}

void SendHeartbeatDue()
{
   const int interval = MathMax(1, Inp_HeartbeatIntervalSec);
   if(TimeCurrent() - g_lastHeartbeatTime < interval && g_lastHeartbeatTime != 0)
      return;

   string body = StringFormat(
      "{\"mt5_login\":%I64d,\"timestamp\":%I64d,\"version\":\"2.00\"}",
      GetLogin(), (long)TimeCurrent());

   string response = "";
   if(!PostJson("/api/v1/sync/heartbeat", body, response))
      return;

   bool received = false;
   if(!JsonExtractBool(response, "received", received) || !received)
   {
      PrintFormat("[TradeSync][ERROR] Heartbeat not accepted: %s", response);
      return;
   }

   g_lastHeartbeatTime = TimeCurrent();
   Print("[TradeSync] Heartbeat sent.");
}

bool PostJson(const string path, const string body, string &response)
{
   response = "";
   const string url = g_baseUrl + path;
   const string headers =
      "Content-Type: application/json; charset=utf-8\r\n" +
      "Authorization: Bearer " + Inp_SyncKey + "\r\n";

   char requestData[];
   char responseData[];
   string responseHeaders = "";
   StringToCharArray(body, requestData, 0, CP_UTF8);

   ResetLastError();
   const int httpCode = WebRequest("POST", url, headers, 10000,
                                   requestData, responseData, responseHeaders);
   if(httpCode == -1)
   {
      PrintFormat("[TradeSync][ERROR] WebRequest failed url=%s error=%d. Add the URL to MT5 Tools > Options > Expert Advisors > Allow WebRequest allowlist.",
                  url, GetLastError());
      return(false);
   }

   response = CharArrayToString(responseData, 0, -1, CP_UTF8);
   if(httpCode < 200 || httpCode >= 300)
   {
      PrintFormat("[TradeSync][ERROR] HTTP %d url=%s response=%s", httpCode, url, response);
      return(false);
   }

   return(true);
}

long GetLogin()
{
   return((long)AccountInfoInteger(ACCOUNT_LOGIN));
}

long GetServerGmtOffset()
{
   return((long)TimeTradeServer() - (long)TimeGMT());
}

void AddSymbolName(string &names[], int &count, const string name)
{
   if(StringLen(name) == 0)
      return;

   for(int i = 0; i < count; i++)
   {
      if(names[i] == name)
         return;
   }

   ArrayResize(names, count + 1);
   names[count] = name;
   count++;
}

double NormalizeZero(const double value)
{
   if(value < 0.0 && value > -0.000000001)
      return(0.0);
   return(value);
}

string DoubleToJson(const double value)
{
   return(DoubleToString(NormalizeZero(value), 8));
}

string JsonString(const string value)
{
   string escaped = value;
   StringReplace(escaped, "\\", "\\\\");
   StringReplace(escaped, "\"", "\\\"");
   StringReplace(escaped, "\r", "\\r");
   StringReplace(escaped, "\n", "\\n");
   StringReplace(escaped, "\t", "\\t");

   string result = "";
   const int length = StringLen(escaped);
   for(int i = 0; i < length; i++)
   {
      ushort ch = StringGetCharacter(escaped, i);
      if(ch < 32)
         result += " ";
      else
         result += ShortToString(ch);
   }

   return(result);
}

bool JsonExtractLong(const string json, const string key, long &value)
{
   value = 0;
   const string pattern = "\"" + key + "\"";
   int pos = StringFind(json, pattern);
   if(pos < 0)
      return(false);

   pos = StringFind(json, ":", pos + StringLen(pattern));
   if(pos < 0)
      return(false);

   pos++;
   const int length = StringLen(json);
   while(pos < length && StringGetCharacter(json, pos) == ' ')
      pos++;

   int start = pos;
   if(pos < length && StringGetCharacter(json, pos) == '-')
      pos++;

   while(pos < length)
   {
      ushort ch = StringGetCharacter(json, pos);
      if(ch < '0' || ch > '9')
         break;
      pos++;
   }

   if(pos == start || (pos == start + 1 && StringGetCharacter(json, start) == '-'))
      return(false);

   value = StringToInteger(StringSubstr(json, start, pos - start));
   return(true);
}

bool JsonExtractBool(const string json, const string key, bool &value)
{
   value = false;
   const string pattern = "\"" + key + "\"";
   int pos = StringFind(json, pattern);
   if(pos < 0)
      return(false);

   pos = StringFind(json, ":", pos + StringLen(pattern));
   if(pos < 0)
      return(false);

   pos++;
   const int length = StringLen(json);
   while(pos < length && StringGetCharacter(json, pos) == ' ')
      pos++;

   if(StringSubstr(json, pos, 4) == "true")
   {
      value = true;
      return(true);
   }

   if(StringSubstr(json, pos, 5) == "false")
   {
      value = false;
      return(true);
   }

   return(false);
}

string TrimTrailingSlash(string url)
{
   while(StringLen(url) > 0 && StringGetCharacter(url, StringLen(url) - 1) == '/')
      url = StringSubstr(url, 0, StringLen(url) - 1);
   return(url);
}
