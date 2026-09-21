//+------------------------------------------------------------------+
//|                                        tradeEZSyncV2.mq5         |
//|             TradeEZ unified connector client for MetaTrader 5    |
//+------------------------------------------------------------------+
#property copyright "TradeEZ"
#property link      "https://www.tradeez.cn"
#property version   "2.00"
#property description "TradeEZ unified connector: handshake, cursor and typed events"

input group "===== 同步服务 ====="
input bool   Inp_EnableSync       = true;
input string Inp_ApiBaseURL       = "https://api.tradeez.cn";
input string Inp_SecretKey        = "";
input int    Inp_SyncIntervalMin  = 5;
input int    Inp_RequestTimeoutMS = 5000;
input int    Inp_MaxBatchSize     = 100;
input int    Inp_SnapshotSeconds  = 30;
input int    Inp_HeartbeatSeconds = 300;
input bool   Inp_DebugSync        = true;

#define CONNECTOR_VERSION "2.0.1"
#define PROTOCOL_VERSION "1.0"
#define SYNC_PREFIX "TEZ.V2."

#import "shell32.dll"
int ShellExecuteW(int hwnd, string lpOperation, string lpFile, string lpParameters, string lpDirectory, int nShowCmd);
#import

datetime g_LastSuccessUtc = 0;
datetime g_NextRetryUtc = 0;
int      g_RetryLevel = 0;
bool     g_SyncInProgress = false;
string   g_ConnectionId = "";
string   g_ServiceDetail = "等待首次握手";
datetime g_ServerCursor = 0;
int      g_DealsCounter = 0;
int      g_SnapshotCounter = 0;
int      g_HeartbeatCounter = 0;
int      g_BatchSequence = 0;
bool     g_UpgradeRequired = false;
string   g_UpgradeUrl = "";
string   g_UpgradeMessage = "";

string NextBatchId(string kind)
{
   g_BatchSequence++;
   return StringFormat("%s-%d-%d-%d", kind, AccountInfoInteger(ACCOUNT_LOGIN), (long)TimeGMT(), g_BatchSequence);
}

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return value;
}

string ComputeHMAC(string secretKey, string body, long timestamp)
{
   uchar key[], message[], empty[], keyHash[];
   StringToCharArray(secretKey, key, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(key) > 0) ArrayResize(key, ArraySize(key) - 1);
   StringToCharArray(body + IntegerToString(timestamp), message, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(message) > 0) ArrayResize(message, ArraySize(message) - 1);

   if(ArraySize(key) > 64)
   {
      if(CryptEncode(CRYPT_HASH_SHA256, key, empty, keyHash) <= 0) return "";
      ArrayCopy(key, keyHash);
      ArrayResize(key, ArraySize(keyHash));
   }

   uchar innerPad[], outerPad[];
   ArrayResize(innerPad, 64);
   ArrayResize(outerPad, 64);
   for(int i = 0; i < 64; i++)
   {
      uchar b = (i < ArraySize(key)) ? key[i] : 0;
      innerPad[i] = b ^ 0x36;
      outerPad[i] = b ^ 0x5c;
   }

   uchar innerData[], innerHash[], outerData[], result[];
   ArrayResize(innerData, 64 + ArraySize(message));
   ArrayCopy(innerData, innerPad, 0, 0, 64);
   ArrayCopy(innerData, message, 64, 0, ArraySize(message));
   if(CryptEncode(CRYPT_HASH_SHA256, innerData, empty, innerHash) <= 0) return "";

   ArrayResize(outerData, 64 + ArraySize(innerHash));
   ArrayCopy(outerData, outerPad, 0, 0, 64);
   ArrayCopy(outerData, innerHash, 64, 0, ArraySize(innerHash));
   if(CryptEncode(CRYPT_HASH_SHA256, outerData, empty, result) <= 0) return "";

   string hex = "";
   for(int i = 0; i < ArraySize(result); i++) hex += StringFormat("%02x", result[i]);
   return hex;
}

string SyncHeaders(string body, long timestamp)
{
   string signature = ComputeHMAC(Inp_SecretKey, body, timestamp);
   return "Content-Type: application/json\r\n" +
          "Authorization: Bearer " + Inp_SecretKey + "\r\n" +
          "X-Timestamp: " + IntegerToString(timestamp) + "\r\n" +
          "X-Signature: " + signature + "\r\n" +
          "X-Protocol-Version: " + PROTOCOL_VERSION + "\r\n" +
          "X-Connector-Version: " + CONNECTOR_VERSION + "\r\n";
}

int PostJson(string path, string body, string &response)
{
   char post[], result[];
   StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(post) > 0) ArrayResize(post, ArraySize(post) - 1);

   long timestamp = TimeGMT();
   string headers = SyncHeaders(body, timestamp);
   string responseHeaders = "";
   ResetLastError();
   int res = WebRequest("POST", Inp_ApiBaseURL + path, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
   int webError = GetLastError();
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(Inp_DebugSync)
      Print("[V2] POST ", path, " HTTP=", res, " MT5错误=", webError, " 响应=", response);
   return res;
}

int GetJson(string path, string &response)
{
   char post[], result[];
   long timestamp = TimeGMT();
   string headers = SyncHeaders("", timestamp);
   string responseHeaders = "";
   ResetLastError();
   int res = WebRequest("GET", Inp_ApiBaseURL + path, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
   int webError = GetLastError();
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(Inp_DebugSync)
      Print("[V2] GET ", path, " HTTP=", res, " MT5错误=", webError, " 响应=", response);
   return res;
}

string ExtractString(string json, string key)
{
   string token = "\"" + key + "\"";
   int pos = StringFind(json, token);
   if(pos < 0) return "";
   int colon = StringFind(json, ":", pos + StringLen(token));
   if(colon < 0) return "";
   int quote = StringFind(json, "\"", colon + 1);
   if(quote < 0) return "";
   int end = StringFind(json, "\"", quote + 1);
   if(end < 0) return "";
   return StringSubstr(json, quote + 1, end - quote - 1);
}

long ExtractLong(string json, string key)
{
   string token = "\"" + key + "\"";
   int pos = StringFind(json, token);
   if(pos < 0) return 0;
   int colon = StringFind(json, ":", pos + StringLen(token));
   if(colon < 0) return 0;
   string rest = StringSubstr(json, colon + 1);
   StringTrimLeft(rest);
   return (long)StringToInteger(rest);
}

bool ExtractBool(string json, string key)
{
   string token = "\"" + key + "\"";
   int pos = StringFind(json, token);
   if(pos < 0) return false;
   int colon = StringFind(json, ":", pos + StringLen(token));
   if(colon < 0) return false;
   return StringFind(json, "true", colon) > colon;
}

string ExtractNestedString(string json, string parent, string key)
{
   string marker = "\"" + parent + "\"";
   int parentPos = StringFind(json, marker);
   if(parentPos < 0) return "";
   int brace = StringFind(json, "{", parentPos + StringLen(marker));
   if(brace < 0) return "";
   int end = StringFind(json, "}", brace);
   if(end < 0) return "";
   string nested = StringSubstr(json, brace, end - brace + 1);
   return ExtractString(nested, key);
}

bool Handshake()
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string body = StringFormat(
      "{\"platform\":\"mt5\",\"account_ref\":\"%I64d\",\"instance_id\":\"mt5-terminal-01\",\"connector_version\":\"%s\"}",
      login, CONNECTOR_VERSION);
   string response = "";
   int http = PostJson("/api/v1/connectors/handshake", body, response);
   if(http < 200 || http >= 300) return false;

   string connectionId = ExtractString(response, "connection_id");
   long cursor = ExtractLong(response, "value");
   if(connectionId == "")
   {
      g_ServiceDetail = "握手响应缺少 connection_id";
      return false;
   }
   g_UpgradeRequired = ExtractBool(response, "required");
   g_UpgradeUrl = ExtractNestedString(response, "upgrade", "download_url");
   g_UpgradeMessage = ExtractNestedString(response, "upgrade", "message");
   g_ConnectionId = connectionId;
   g_ServerCursor = (datetime)cursor;
   g_ServiceDetail = g_UpgradeRequired ? "需要升级连接器版本" : "连接器握手成功";
   return true;
}

bool FetchCursor()
{
   if(g_ConnectionId == "") return false;
   string response = "";
   int http = GetJson("/api/v1/connections/" + g_ConnectionId + "/cursor", response);
   if(http < 200 || http >= 300) return false;
   g_ServerCursor = (datetime)ExtractLong(response, "value");
   return true;
}

datetime ServerTimeToUtc(datetime serverTime)
{
   return serverTime - (int)(TimeTradeServer() - TimeGMT());
}

datetime UtcToServerTime(datetime utcTime)
{
   return utcTime + (int)(TimeTradeServer() - TimeGMT());
}

int CollectTradeEvents(datetime cursorUtc, string &events[], datetime &latestCloseUtc, bool &ok)
{
   ArrayResize(events, 0);
   latestCloseUtc = 0;
   ok = false;

   datetime fromServer = cursorUtc <= 0 ? 0 : UtcToServerTime(cursorUtc);
   datetime wideFrom = cursorUtc <= 0 ? 0 : fromServer - 30 * 86400;
   datetime toServer = TimeCurrent() + 1;
   if(wideFrom > toServer) return 0;
   if(!HistorySelect(wideFrom, toServer)) return 0;

   int total = HistoryDealsTotal();
   long positionIds[];
   datetime closeTimesUtc[];
   datetime openTimesUtc[];
   int serverGmtOffset = (int)(TimeTradeServer() - TimeGMT());

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if(posId == 0) continue;

      datetime closeUtc = ServerTimeToUtc((datetime)HistoryDealGetInteger(ticket, DEAL_TIME));
      if(cursorUtc > 0 && closeUtc <= cursorUtc) continue;

      datetime openUtc = closeUtc;
      for(int j = 0; j < total; j++)
      {
         ulong dj = HistoryDealGetTicket(j);
         if(dj == 0 || HistoryDealGetInteger(dj, DEAL_POSITION_ID) != posId) continue;
         long entry = HistoryDealGetInteger(dj, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_INOUT) continue;
         datetime t = ServerTimeToUtc((datetime)HistoryDealGetInteger(dj, DEAL_TIME));
         if(t < openUtc) openUtc = t;
      }

      int idx = -1;
      for(int j = 0; j < ArraySize(positionIds); j++)
         if(positionIds[j] == posId) { idx = j; break; }

      if(idx < 0)
      {
         int n = ArraySize(positionIds);
         ArrayResize(positionIds, n + 1);
         ArrayResize(closeTimesUtc, n + 1);
         ArrayResize(openTimesUtc, n + 1);
         positionIds[n] = posId;
         closeTimesUtc[n] = closeUtc;
         openTimesUtc[n] = openUtc;
      }
      else if(closeUtc > closeTimesUtc[idx])
      {
         closeTimesUtc[idx] = closeUtc;
      }
   }

   for(int i = 0; i < total; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;
      long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      int posIndex = -1;
      for(int j = 0; j < ArraySize(positionIds); j++)
         if(positionIds[j] == posId) { posIndex = j; break; }
      if(posIndex < 0) continue;

      long orderId = HistoryDealGetInteger(dealTicket, DEAL_ORDER);
      string symbol = JsonEscape(HistoryDealGetString(dealTicket, DEAL_SYMBOL));
      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      long type = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double sl = HistoryDealGetDouble(dealTicket, DEAL_SL);
      double tp = HistoryDealGetDouble(dealTicket, DEAL_TP);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
      string comment = JsonEscape(HistoryDealGetString(dealTicket, DEAL_COMMENT));
      datetime openTimeUtc = openTimesUtc[posIndex];
      datetime closeTimeUtc = closeTimesUtc[posIndex];
      datetime dealTimeUtc = ServerTimeToUtc((datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME));
      if(closeTimeUtc > latestCloseUtc) latestCloseUtc = closeTimeUtc;

      string data = StringFormat(
         "{\"ticket\":%I64d,\"position_id\":%I64d,\"order_id\":%I64d," +
         "\"symbol\":\"%s\",\"entry\":%d,\"type\":%d," +
         "\"volume\":%.2f,\"price\":%.5f,\"sl_price\":%.5f,\"tp_price\":%.5f," +
         "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f," +
         "\"magic\":%I64d,\"comment\":\"%s\"," +
         "\"open_time\":%I64d,\"deal_time\":%I64d," +
         "\"server_open_time\":%I64d,\"server_deal_time\":%I64d,\"server_gmt_offset\":%d}",
         dealTicket, posId, orderId, symbol, entry, type,
         volume, price, sl, tp, profit, swap, commission, magic, comment,
         (long)openTimeUtc, (long)dealTimeUtc,
         (long)UtcToServerTime(openTimeUtc), (long)HistoryDealGetInteger(dealTicket, DEAL_TIME),
         serverGmtOffset);

      string event = StringFormat(
         "{\"event_id\":\"trade:%I64d\",\"type\":\"trade\",\"occurred_at\":%I64d,\"data\":%s}",
         dealTicket, (long)dealTimeUtc, data);

      int n = ArraySize(events);
      ArrayResize(events, n + 1);
      events[n] = event;
   }

   ok = true;
   return ArraySize(events);
}

bool SubmitEvents(string &events[], int start, int count, int batchIndex, int batchCount, string batchId)
{
   string list = "";
   for(int i = 0; i < count; i++)
   {
      if(i > 0) list += ",";
      list += events[start + i];
   }

   string body = StringFormat(
      "{\"batch_id\":\"%s\",\"batch_index\":%d,\"batch_count\":%d,\"events\":[%s]}",
      batchId, batchIndex, batchCount, list);
   string response = "";
   int http = PostJson("/api/v1/connections/" + g_ConnectionId + "/events", body, response);
   return http >= 200 && http < 300;
}

bool SyncTrades()
{
   if(!FetchCursor())
   {
      g_ServiceDetail = "游标读取失败";
      return false;
   }

   string events[];
   datetime latestCloseUtc = 0;
   bool ok = false;
   int count = CollectTradeEvents(g_ServerCursor, events, latestCloseUtc, ok);
   if(!ok)
   {
      g_ServiceDetail = "成交采集失败";
      return false;
   }
   if(count == 0)
   {
      g_ServiceDetail = "没有新成交";
      return true;
   }

   int limit = MathMax(1, MathMin(Inp_MaxBatchSize, 1000));
   int batchCount = (count + limit - 1) / limit;
   int batchIndex = 0;
   for(int start = 0; start < count; start += limit)
   {
      int part = MathMin(limit, count - start);
      string batchId = StringFormat(
         "trade-%d-%I64d-%d-%d",
         AccountInfoInteger(ACCOUNT_LOGIN),
         (long)g_ServerCursor,
         batchIndex,
         batchCount);
      if(!SubmitEvents(events, start, part, batchIndex, batchCount, batchId))
      {
         g_ServiceDetail = "事件批次提交失败";
         return false;
      }
      batchIndex++;
   }

   g_ServiceDetail = "成交事件已提交";
   return true;
}

bool SyncInstrument()
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double contractSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   long now = TimeGMT();
   string data = StringFormat(
      "{\"symbol\":\"%s\",\"digits\":%d,\"point\":%.10f,\"tick_value\":%.5f,\"contract_size\":%.2f}",
      JsonEscape(_Symbol), digits, point, tickValue, contractSize);
   string event = StringFormat("{\"event_id\":\"instrument:%s\",\"type\":\"instrument\",\"occurred_at\":%I64d,\"data\":%s}",
                               JsonEscape(_Symbol), now, data);
   string body = StringFormat("{\"batch_id\":\"%s\",\"batch_index\":0,\"batch_count\":1,\"events\":[%s]}",
                              NextBatchId("instrument"), event);
   string response = "";
   return PostJson("/api/v1/connections/" + g_ConnectionId + "/events", body, response) >= 200;
}

bool SyncSnapshot()
{
   long now = TimeGMT();
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   string data = StringFormat(
      "{\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"free_margin\":%.2f,\"occurred_at\":%I64d}",
      balance, equity, margin, freeMargin, now);
   string event = StringFormat("{\"event_id\":\"snapshot:%I64d\",\"type\":\"account_snapshot\",\"occurred_at\":%I64d,\"data\":%s}",
                               now, now, data);
   string body = StringFormat("{\"batch_id\":\"%s\",\"batch_index\":0,\"batch_count\":1,\"events\":[%s]}",
                              NextBatchId("snapshot"), event);
   string response = "";
   return PostJson("/api/v1/connections/" + g_ConnectionId + "/events", body, response) >= 200;
}

bool SyncHeartbeat()
{
   long now = TimeGMT();
   string data = StringFormat(
      "{\"occurred_at\":%I64d,\"connector_status\":\"online\",\"version\":\"%s\",\"broker_server\":\"%s\",\"server_gmt_offset\":%d}",
      now, CONNECTOR_VERSION, JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      (int)(TimeTradeServer() - TimeGMT()));
   string event = StringFormat("{\"event_id\":\"heartbeat:%I64d\",\"type\":\"heartbeat\",\"occurred_at\":%I64d,\"data\":%s}",
                               now, now, data);
   string body = StringFormat("{\"batch_id\":\"%s\",\"batch_index\":0,\"batch_count\":1,\"events\":[%s]}",
                              NextBatchId("heartbeat"), event);
   string response = "";
   return PostJson("/api/v1/connections/" + g_ConnectionId + "/events", body, response) >= 200;
}

int RetryDelaySeconds()
{
   if(g_RetryLevel <= 0) return 5;
   if(g_RetryLevel == 1) return 15;
   if(g_RetryLevel == 2) return 60;
   return 300;
}

void RenderState()
{
   string account = (string)AccountInfoInteger(ACCOUNT_LOGIN) + " | " + AccountInfoString(ACCOUNT_SERVER);
   string last = g_LastSuccessUtc > 0 ? TimeToString(g_LastSuccessUtc, TIME_DATE | TIME_SECONDS) + " UTC" : "尚未成功";
   if(g_UpgradeRequired)
      Comment("TradeEZ Connector V2\n",
              "账户: ", account, "\n",
              "状态: ", g_ServiceDetail, "\n",
              g_UpgradeMessage, "\n",
              "下载: ", g_UpgradeUrl);
   else
      Comment(
         "TradeEZ Connector V2\n",
         "账户: ", account, "\n",
         "连接: ", g_ConnectionId == "" ? "未握手" : g_ConnectionId, "\n",
         "状态: ", g_ServiceDetail, "\n",
         "最近成功: ", last);
}

void RenderUpgradeButton()
{
   string name = SYNC_PREFIX + "Upgrade";
   if(!g_UpgradeRequired)
   {
      ObjectDelete(0, name);
      return;
   }
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 20);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 180);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, 220);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 34);
   ObjectSetString(0, name, OBJPROP_TEXT, "下载最新连接器");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ChartRedraw();
}

int OnInit()
{
   if(!Inp_EnableSync || Inp_SecretKey == "")
   {
      g_ServiceDetail = !Inp_EnableSync ? "同步已停用" : "请配置同步密钥";
      RenderState();
      EventSetTimer(1);
      return INIT_SUCCEEDED;
   }

   if(!Handshake())
   {
      g_ServiceDetail = "首次握手失败";
      g_NextRetryUtc = TimeGMT() + RetryDelaySeconds();
   }
   RenderState();
   RenderUpgradeButton();
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectDelete(0, SYNC_PREFIX + "Upgrade");
   Comment("");
}

void OnTick() {}

void OnTimer()
{
   if(!Inp_EnableSync || Inp_SecretKey == "")
   {
      RenderState();
      return;
   }

   if(g_SyncInProgress) return;
   if(g_NextRetryUtc > 0 && TimeGMT() < g_NextRetryUtc)
   {
      RenderState();
      return;
   }

   if(g_ConnectionId == "" && !Handshake())
   {
      g_NextRetryUtc = TimeGMT() + RetryDelaySeconds();
      RenderUpgradeButton();
      RenderState();
      return;
   }

   g_SyncInProgress = true;
   g_DealsCounter++;
   g_SnapshotCounter++;
   g_HeartbeatCounter++;

   bool ok = true;
   if(g_DealsCounter >= MathMax(1, Inp_SyncIntervalMin * 60))
   {
      g_DealsCounter = 0;
      ok = SyncTrades() && SyncInstrument();
   }
   else if(g_SnapshotCounter >= MathMax(5, Inp_SnapshotSeconds))
   {
      g_SnapshotCounter = 0;
      ok = SyncSnapshot();
   }
   else if(g_HeartbeatCounter >= MathMax(30, Inp_HeartbeatSeconds))
   {
      g_HeartbeatCounter = 0;
      ok = SyncHeartbeat();
   }

   if(ok)
   {
      g_LastSuccessUtc = TimeGMT();
      g_RetryLevel = 0;
      g_NextRetryUtc = 0;
   }
   else
   {
      g_RetryLevel++;
      g_NextRetryUtc = TimeGMT() + RetryDelaySeconds();
   }

   g_SyncInProgress = false;
   RenderUpgradeButton();
   RenderState();
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == SYNC_PREFIX + "Upgrade")
   {
      if(g_UpgradeUrl != "")
         ShellExecuteW(0, "open", g_UpgradeUrl, "", "", 1);
      return;
   }
   if(id == CHARTEVENT_CLICK)
   {
      if(!g_SyncInProgress && g_ConnectionId != "")
      {
         g_DealsCounter = MathMax(1, Inp_SyncIntervalMin * 60);
      }
   }
}
