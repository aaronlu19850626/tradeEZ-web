//+------------------------------------------------------------------+
//|                                            tradeEZSync.mq5        |
//|                  TradeEZ-SOP 独立账户数据同步服务 EA              |
//|                  最后修改时间：2026-09-19 00:05（北京时间）       |
//+------------------------------------------------------------------+
#property copyright "TradeEZ-SOP"
#property link      "https://www.tradeez.cn"
#property version   "1.00"
#property description "TradeEZ-SOP 独立数据同步服务：网络请求与交易 EA 事件线程完全隔离"

input group "===== 同步服务 ====="
input bool   Inp_EnableSync       = true;                      // 启用同步服务
input string Inp_ApiBaseURL       = "https://api.tradeez.cn"; // API 基础地址
input string Inp_SecretKey        = "";                        // 服务器下发的完整密钥
input int    Inp_SyncIntervalMin  = 5;                         // 成交增量同步周期(分钟)
input int    Inp_RequestTimeoutMS = 5000;                      // 单次 HTTP 超时(毫秒)
input int    Inp_MaxBatchSize     = 100;                       // 单批最大成交数
input bool   Inp_DebugSync        = true;                      // 输出同步日志

input group "===== 服务调度 ====="
input int    Inp_SnapshotSeconds  = 30;                        // 账户快照周期(秒)
input int    Inp_HeartbeatSeconds = 300;                       // 心跳周期(秒)
input int    Inp_SettingsMinutes  = 60;                        // 实例参数校验周期(分钟)

#define SYNC_PREFIX "TEZSYNC_"
#define COLOR_BG C'13,16,21'
#define COLOR_CARD C'21,26,35'
#define COLOR_BORDER C'58,68,85'
#define COLOR_TEXT C'240,243,246'
#define COLOR_MUTED C'112,125,142'
#define COLOR_BLUE C'41,121,255'
#define COLOR_RED C'255,82,82'
#define COLOR_GOLD C'255,160,0'

enum ENUM_SYNC_SERVICE_STATE
{
   SERVICE_DISABLED = 0,
   SERVICE_IDLE = 1,
   SERVICE_BUSY = 2,
   SERVICE_ERROR = 3,
   SERVICE_CONFIG_ERROR = 4,
   SERVICE_DUPLICATE = 5
};

datetime g_LastSyncTime = 0;
bool     g_SyncInProgress = false;
ENUM_SYNC_SERVICE_STATE g_ServiceState = SERVICE_IDLE;
string   g_ServiceDetail = "等待首次同步";
datetime g_LastSuccessUtc = 0;
datetime g_NextRetryUtc = 0;
int      g_RetryLevel = 0;
int      g_DealsCounter = 0;
int      g_SnapshotCounter = 0;
int      g_HeartbeatCounter = 0;
int      g_SettingsCounter = 0;
long     g_LastDailyKey = -1;
bool     g_StartupPending = true;
bool     g_ManualConfirm = false;
datetime g_ManualConfirmUntil = 0;
bool     g_HasLease = false;
double   g_LeaseOwner = 0.0;

int ServerGmtOffset()
{
   return (int)(TimeTradeServer() - TimeGMT());
}

string LeaseSuffix()
{
   string server = AccountInfoString(ACCOUNT_SERVER);
   uint hash = 2166136261;
   for(int i=0; i<StringLen(server); i++)
      hash = (hash ^ (uint)StringGetCharacter(server, i)) * 16777619;
   return (string)AccountInfoInteger(ACCOUNT_LOGIN) + "." + (string)hash;
}

string LeaseOwnerKey() { return "TEZ.SYNC." + LeaseSuffix() + ".owner"; }
string LeaseBeatKey()  { return "TEZ.SYNC." + LeaseSuffix() + ".beat"; }
string StateKey()      { return "TEZ.SYNC." + LeaseSuffix() + ".state"; }
string SuccessKey()    { return "TEZ.SYNC." + LeaseSuffix() + ".success"; }

void SetServiceState(ENUM_SYNC_SERVICE_STATE state, string detail)
{
   g_ServiceState = state;
   g_ServiceDetail = detail;
   GlobalVariableSet(StateKey(), (double)state);
   if(g_LastSuccessUtc > 0) GlobalVariableSet(SuccessKey(), (double)g_LastSuccessUtc);
}

void CreateRect(string name,int x,int y,int w,int h,color bg,color border)
{
   string n=SYNC_PREFIX+name;
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_RECTANGLE_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);
   ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);
   ObjectSetInteger(0,n,OBJPROP_BORDER_COLOR,border);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
}

void CreateText(string name,int x,int y,string value,color clr,int size,bool bold=false)
{
   string n=SYNC_PREFIX+name;
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetString(0,n,OBJPROP_TEXT,value);
   ObjectSetString(0,n,OBJPROP_FONT,bold ? "Segoe UI Bold" : "Segoe UI");
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetInteger(0,n,OBJPROP_COLOR,clr);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
}

void CreateSyncButton(string name,int x,int y,int w,int h,string value,color border,color text)
{
   string n=SYNC_PREFIX+name;
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);
   ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetString(0,n,OBJPROP_TEXT,value);
   ObjectSetString(0,n,OBJPROP_FONT,"Segoe UI");
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,9);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,COLOR_CARD);
   ObjectSetInteger(0,n,OBJPROP_BORDER_COLOR,border);
   ObjectSetInteger(0,n,OBJPROP_COLOR,text);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_STATE,false);
}

string StateCaption()
{
   if(g_ServiceState==SERVICE_BUSY) return "正在同步数据…";
   if(g_ServiceState==SERVICE_ERROR) return "同步失败";
   if(g_ServiceState==SERVICE_CONFIG_ERROR) return "同步配置错误";
   if(g_ServiceState==SERVICE_DUPLICATE) return "已有同步服务运行";
   if(g_ServiceState==SERVICE_DISABLED) return "同步已停用";
   return "同步空闲";
}

color StateColor()
{
   if(g_ServiceState==SERVICE_BUSY || g_ServiceState==SERVICE_ERROR ||
      g_ServiceState==SERVICE_CONFIG_ERROR || g_ServiceState==SERVICE_DUPLICATE) return COLOR_RED;
   if(g_ServiceState==SERVICE_DISABLED) return COLOR_MUTED;
   return COLOR_BLUE;
}

void RenderSyncPanel()
{
   CreateRect("Panel",12,12,410,174,COLOR_BG,COLOR_GOLD);
   CreateText("Title",30,27,"TradeEZ 数据同步服务",COLOR_TEXT,13,true);
   CreateText("Account",30,56,"账户  "+(string)AccountInfoInteger(ACCOUNT_LOGIN)+"  |  "+AccountInfoString(ACCOUNT_SERVER),COLOR_MUTED,9);
   CreateText("State",30,82,StateCaption(),StateColor(),11,true);
   CreateText("Detail",30,106,g_ServiceDetail,COLOR_MUTED,8);
   string last = g_LastSuccessUtc>0 ? TimeToString(g_LastSuccessUtc,TIME_DATE|TIME_SECONDS)+" UTC" : "尚未成功";
   CreateText("Last",30,128,"最近成功："+last,COLOR_MUTED,8);

   bool enabled = Inp_EnableSync && Inp_SecretKey!="" && g_HasLease && g_ServiceState!=SERVICE_BUSY;
   color b = enabled ? COLOR_GOLD : COLOR_BORDER;
   color t = enabled ? COLOR_GOLD : COLOR_MUTED;
   string caption = g_ManualConfirm ? "确认同步" : "同步数据";
   CreateSyncButton("Manual",292,74,112,30,caption,b,t);
   if(g_ManualConfirm)
      CreateSyncButton("Cancel",292,112,112,26,"取消",COLOR_BORDER,COLOR_TEXT);
   else
      ObjectDelete(0,SYNC_PREFIX+"Cancel");
   ChartRedraw();
}

bool AcquireLease()
{
   double now=(double)TimeGMT();
   double owner=GlobalVariableCheck(LeaseOwnerKey()) ? GlobalVariableGet(LeaseOwnerKey()) : 0.0;
   double beat=GlobalVariableCheck(LeaseBeatKey()) ? GlobalVariableGet(LeaseBeatKey()) : 0.0;
   g_LeaseOwner=(double)ChartID();
   if(owner!=0.0 && owner!=g_LeaseOwner && now-beat<120.0)
      return false;
   GlobalVariableSet(LeaseOwnerKey(),g_LeaseOwner);
   GlobalVariableSet(LeaseBeatKey(),now);
   GlobalVariablesFlush();
   return true;
}

void RenewLease()
{
   if(!g_HasLease) return;
   if(GlobalVariableGet(LeaseOwnerKey())!=g_LeaseOwner)
   {
      g_HasLease=false;
      SetServiceState(SERVICE_DUPLICATE,"租约已由另一实例接管");
      return;
   }
   GlobalVariableSet(LeaseBeatKey(),(double)TimeGMT());
}

void ReleaseLease()
{
   if(!g_HasLease) return;
   if(GlobalVariableCheck(LeaseOwnerKey()) && GlobalVariableGet(LeaseOwnerKey())==g_LeaseOwner)
   {
      GlobalVariableDel(LeaseOwnerKey());
      GlobalVariableDel(LeaseBeatKey());
   }
   g_HasLease=false;
}

//+------------------------------------------------------------------+
//| 数据同步模块 (TradeSync-Web) - 增量同步版本                       |
//+------------------------------------------------------------------+
// 全局变量：服务器端最后同步游标（最近平仓成交时间，Unix UTC 秒）
datetime g_ServerLastSyncTime = 0;
bool     g_LastSyncQueryOK = false;  // 区分“服务器返回0”与“请求失败”

// MT5 历史时间使用交易服务器时区；同步协议统一传 Unix UTC 秒。
datetime ServerTimeToUtc(datetime serverTime) { return serverTime - ServerGmtOffset(); }
datetime UtcToServerTime(datetime utcTime)     { return utcTime + ServerGmtOffset(); }

// 标准 HMAC-SHA256：key=服务器生成的完整密钥，message=body+UTC timestamp。
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
           "X-Signature: " + signature + "\r\n";
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

// 获取服务器保存的同步游标。该值定义为“最近一笔已提交订单的开仓 UTC 时间”。
datetime GetServerLastSyncTime()
{
    g_LastSyncQueryOK = false;
    if(!Inp_EnableSync || Inp_SecretKey == "") return 0;

    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    string body = StringFormat("{\"mt5_login\":%I64d}", login);
    long timestamp = TimeGMT();
    string headers = SyncHeaders(body, timestamp);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);

    string url = Inp_ApiBaseURL + "/api/v1/sync/last_sync_time";
    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

    if(Inp_DebugSync)
        Print("[Sync Cursor] POST ", url, " | HTTP=", res, " | MT5错误=", webError, " | 响应=", response);

    if(res >= 200 && res < 300)
    {
        int pos = StringFind(response, "\"last_sync_time\"");
        int colonPos = (pos >= 0) ? StringFind(response, ":", pos) : -1;
        if(colonPos >= 0)
        {
            string numStr = StringSubstr(response, colonPos + 1);
            int commaPos = StringFind(numStr, ",");
            int bracePos = StringFind(numStr, "}");
            int endPos = -1;
            if(commaPos >= 0) endPos = commaPos;
            if(bracePos >= 0 && (endPos < 0 || bracePos < endPos)) endPos = bracePos;
            if(endPos >= 0) numStr = StringSubstr(numStr, 0, endPos);
            StringReplace(numStr, "\"", "");
            StringTrimLeft(numStr);
            StringTrimRight(numStr);
            datetime lastTimeUtc = (datetime)StringToInteger(numStr);
            g_LastSyncQueryOK = true;
            if(Inp_DebugSync)
                Print("[Sync Cursor] 服务器平仓时间游标(UTC)=", (long)lastTimeUtc);
            return lastTimeUtc;
        }
        if(Inp_DebugSync) Print("[Sync Cursor] 失败:响应缺少 last_sync_time");
    }
    else if(Inp_DebugSync)
        Print("[Sync Cursor] 请求失败;HTTP=-1时请检查WebRequest白名单");

    return 0;
}

// 收集平仓成交时间 >= 游标的订单所对应的全部成交。
// 游标基准 = 最后一笔已同步的平仓成交时间(UTC),确保只上传已了结的完整交易,避免持仓中订单的脏数据。
// 边界采用包含式,游标同秒的成交会安全重传,由服务器按 ticket 幂等去重。
int CollectDealsAfterCloseTime(datetime cursorUtc, string &dealsJson[],
                              datetime &latestCloseTimeUtc, bool &collectionOK)
{
    ArrayResize(dealsJson, 0);
    latestCloseTimeUtc = 0;
    collectionOK = false;

    datetime fromServer = UtcToServerTime(cursorUtc);
    datetime toServer = TimeCurrent() + 1;
    if(fromServer > toServer)
    {
        if(Inp_DebugSync) Print("[Sync Collect] 失败:服务器游标晚于当前时间, cursor_utc=", (long)cursorUtc);
        return 0;
    }
    if(!HistorySelect(fromServer, toServer))
    {
        if(Inp_DebugSync) Print("[Sync Collect] HistorySelect失败, cursor_utc=", (long)cursorUtc);
        return 0;
    }

    int total = HistoryDealsTotal();
    long positionIds[];     // 已平仓订单的 position_id 列表
    datetime closeTimesUtc[]; // 对应每笔订单的平仓成交时间(UTC),用于推进游标
    datetime openTimesUtc[];  // 对应每笔订单的开仓时间(UTC),传给服务器

    // 第一遍:找出所有平仓成交在游标之后的订单,收集 position_id
    for(int i = 0; i < total; i++)
    {
        ulong ticket = HistoryDealGetTicket(i);
        if(ticket == 0) continue;
        long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
        if(entry != DEAL_ENTRY_OUT) continue;  // 只看平仓成交
        long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
        if(posId == 0) continue;

        datetime closeUtc = ServerTimeToUtc((datetime)HistoryDealGetInteger(ticket, DEAL_TIME));
        if(closeUtc < cursorUtc) continue;  // 平仓时间在游标之前 → 已同步过,跳过

        // 计算开仓时间(用于传给服务器)
        datetime openUtc = closeUtc;  // 兜底
        for(int j = 0; j < total; j++)
        {
            ulong dj = HistoryDealGetTicket(j);
            if(dj == 0) continue;
            if(HistoryDealGetInteger(dj, DEAL_POSITION_ID) != posId) continue;
            long e = HistoryDealGetInteger(dj, DEAL_ENTRY);
            if(e != DEAL_ENTRY_IN && e != DEAL_ENTRY_INOUT) continue;
            datetime t = ServerTimeToUtc((datetime)HistoryDealGetInteger(dj, DEAL_TIME));
            if(t < openUtc) openUtc = t;  // 取最早的开仓时间
        }

        // 检查是否已存在(一个position可能有多次平仓如减仓,取最晚的平仓时间)
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
            closeTimesUtc[idx] = closeUtc;  // 更新为最晚的平仓时间
        }
    }

    // 第二遍:为每个已平仓订单序列化其全部成交(开仓/减仓/平仓等),时间字段全部UTC
    // HistorySelect范围就是游标到现在,所以在范围内的成交都能找到;
    // 但开仓成交可能早于游标(跨游标区间的订单),需要扩大范围才能拿到开仓成交。
    // 稳妥做法:扩大 HistorySelect 到 30 天前,确保开仓成交也在范围内。
    datetime wideFrom = fromServer - 30 * 86400;
    if(HistorySelect(wideFrom, toServer)) total = HistoryDealsTotal();

    for(int i = 0; i < total; i++)
    {
        ulong dealTicket = HistoryDealGetTicket(i);
        if(dealTicket == 0) continue;
        long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
        int posIndex = -1;
        for(int j = 0; j < ArraySize(positionIds); j++)
            if(positionIds[j] == posId) { posIndex = j; break; }
        if(posIndex < 0) continue;  // 不是目标订单

        datetime openTimeUtc = openTimesUtc[posIndex];
        datetime closeTimeUtc = closeTimesUtc[posIndex];
        datetime dealTimeUtc = ServerTimeToUtc((datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME));
        if(closeTimeUtc > latestCloseTimeUtc) latestCloseTimeUtc = closeTimeUtc;

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

        string json = StringFormat(
            "{" +
            "\"ticket\":%I64d,\"position_id\":%I64d,\"order_id\":%I64d," +
            "\"symbol\":\"%s\",\"entry\":%d,\"type\":%d," +
            "\"volume\":%.2f,\"price\":%.5f,\"sl_price\":%.5f,\"tp_price\":%.5f," +
            "\"profit\":%.2f,\"swap\":%.2f,\"commission\":%.2f," +
            "\"magic\":%I64d,\"comment\":\"%s\"," +
            "\"open_time\":%I64d,\"deal_time\":%I64d" +
            "}",
            dealTicket, posId, orderId, symbol, entry, type,
            volume, price, sl, tp, profit, swap, commission, magic, comment,
            (long)openTimeUtc, (long)dealTimeUtc);

        int n = ArraySize(dealsJson);
        ArrayResize(dealsJson, n + 1);
        dealsJson[n] = json;
    }

    collectionOK = true;
    return ArraySize(dealsJson);
}
// 成交全部被服务器接受后，再用单独请求推进“最后开仓时间”游标。

// 分批上传成交到服务器
bool UploadDealsBatch(const string &dealsJson[], int startIndex, int batchCount, int batchNumber)
{
    string bodyDeals = "";
    for(int i = 0; i < batchCount; i++)
    {
        if(i > 0) bodyDeals += ",";
        bodyDeals += dealsJson[startIndex + i];
    }

    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    string body = StringFormat("{\"mt5_login\":%I64d,\"deals\":[%s]}", login, bodyDeals);
    long timestamp = TimeGMT();
    string headers = SyncHeaders(body, timestamp);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);
    string url = Inp_ApiBaseURL + "/api/v1/ingest/deals";
    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
    if(Inp_DebugSync)
        Print("[Sync Deals] 批次", batchNumber, " | 数量=", batchCount,
              " | HTTP=", res, " | MT5错误=", webError, " | 响应=", response);
    return (res >= 200 && res < 300);
}

bool UpdateServerLastSyncTime(datetime latestCloseTimeUtc)
{
    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    string body = StringFormat("{\"mt5_login\":%I64d,\"last_sync_time\":%I64d}", login, (long)latestCloseTimeUtc);
    long timestamp = TimeGMT();
    string headers = SyncHeaders(body, timestamp);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);
    string url = Inp_ApiBaseURL + "/api/v1/sync/update_last_sync_time";
    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
    if(Inp_DebugSync)
        Print("[Sync Cursor] 更新平仓时间游标(UTC)=", (long)latestCloseTimeUtc,
              " | HTTP=", res, " | MT5错误=", webError, " | 响应=", response);
    return (res >= 200 && res < 300);
}

// 上传成交批次；所有批次成功后才提交平仓时间游标。
bool SyncDeals()
{
    if(!Inp_EnableSync || Inp_SecretKey == "")
    {
        if(Inp_DebugSync) Print("[Sync Deals] 跳过:同步未启用或服务器密钥为空");
        return false;
    }
    if(g_SyncInProgress)
    {
        if(Inp_DebugSync) Print("[Sync Deals] 跳过:已有同步任务执行中");
        return false;
    }
    g_SyncInProgress = true;
    if(Inp_DebugSync) Print("[Sync Deals] ========== 开始同步成交(UTC/平仓游标) ==========");

    datetime cursorUtc = GetServerLastSyncTime();
    bool cursorQueryOK = g_LastSyncQueryOK;
    if(!cursorQueryOK || cursorUtc == 0)
    {
        cursorUtc = TimeGMT() - 7 * 86400;
        if(Inp_DebugSync)
            Print("[Sync Deals] ", cursorQueryOK ? "首次同步" : "游标获取失败",
                  ",按近7日回溯,起点UTC=", (long)cursorUtc);
    }

    string deals[];
    datetime latestCloseTimeUtc = 0;
    bool collectionOK = false;
    int count = CollectDealsAfterCloseTime(cursorUtc, deals, latestCloseTimeUtc, collectionOK);
    if(!collectionOK)
    {
        g_SyncInProgress = false;
        if(Inp_DebugSync) Print("[Sync Deals] 失败:MT5历史成交读取失败");
        return false;
    }

    if(count == 0)
    {
        g_SyncInProgress = false;
        if(!cursorQueryOK)
        {
            if(Inp_DebugSync) Print("[Sync Deals] 失败:游标查询失败且近7日无可提交订单");
            return false;
        }
        g_LastSyncTime = TimeCurrent();
        if(Inp_DebugSync) Print("[Sync Deals] 完成:没有新订单,服务器游标已核对");
        return true;
    }

    int batchLimit = Inp_MaxBatchSize;
    if(batchLimit < 1) batchLimit = 1;
    if(batchLimit > 1000) batchLimit = 1000;
    int batchNumber = 0;
    for(int start = 0; start < count; start += batchLimit)
    {
        batchNumber++;
        int batchCount = MathMin(batchLimit, count - start);
        if(!UploadDealsBatch(deals, start, batchCount, batchNumber))
        {
            g_SyncInProgress = false;
            if(Inp_DebugSync) Print("[Sync Deals] 失败:批次上传未全部完成,不推进游标");
            return false;
        }
    }

    if(latestCloseTimeUtc <= 0 || !UpdateServerLastSyncTime(latestCloseTimeUtc))
    {
        g_SyncInProgress = false;
        if(Inp_DebugSync) Print("[Sync Deals] 失败:成交已上传但游标更新失败,下次将幂等重传");
        return false;
    }

    g_ServerLastSyncTime = latestCloseTimeUtc;
    g_LastSyncTime = TimeCurrent();
    g_SyncInProgress = false;
    if(Inp_DebugSync)
        Print("[Sync Deals] 完成:上传", count, "笔成交,最后平仓时间游标UTC=", (long)latestCloseTimeUtc);
    return true;
}

// 上传品种规格
bool SyncSymbols()
{
    if(Inp_DebugSync) Print("[Sync Symbols] ========== 开始同步品种规格 ==========");
    if(!Inp_EnableSync)
    {
        if(Inp_DebugSync) Print("[Sync Symbols] 跳过:订单同步未启用");
        return false;
    }
    if(Inp_SecretKey == "")
    {
        if(Inp_DebugSync) Print("[Sync Symbols] 失败:账户密钥为空");
        return false;
    }

    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
    double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
    double contractSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
    int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

    string body = StringFormat(
        "{\"mt5_login\":%I64d,\"symbols\":[{\"name\":\"%s\",\"digits\":%d,\"point\":%.10f," +
        "\"tick_value\":%.5f,\"contract_size\":%.2f}]}",
        login, _Symbol, digits, point, tickValue, contractSize
    );

    long timestamp = TimeGMT();
    string headers = SyncHeaders(body, timestamp);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);

    string url = Inp_ApiBaseURL + "/api/v1/ingest/symbols";
    if(Inp_DebugSync)
        Print("[Sync Symbols] POST ", url, " | 品种=", _Symbol, " | digits=", digits,
              " | point=", DoubleToString(point, digits), " | 请求字节=", ArraySize(post));

    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

    if(Inp_DebugSync)
        Print("[Sync Symbols] HTTP=", res, " | MT5错误=", webError, " | 响应=", response);

    if(res == 200)
    {
        if(Inp_DebugSync)
            Print("[Sync Symbols] 完成:品种规格同步成功");
        return true;
    }
    if(Inp_DebugSync) Print("[Sync Symbols] 失败:品种规格未被服务器接受");
    return false;
}

// 上传账户快照
bool SyncSnapshot()
{
    if(Inp_DebugSync) Print("[Sync Snapshot] ========== 开始同步账户快照 ==========");
    if(!Inp_EnableSync)
    {
        if(Inp_DebugSync) Print("[Sync Snapshot] 跳过:订单同步未启用");
        return false;
    }
    if(Inp_SecretKey == "")
    {
        if(Inp_DebugSync) Print("[Sync Snapshot] 失败:账户密钥为空");
        return false;
    }

    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double margin = AccountInfoDouble(ACCOUNT_MARGIN);
    double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
    datetime timestamp = TimeGMT();

    string body = StringFormat(
        "{\"mt5_login\":%I64d,\"snapshots\":[{\"balance\":%.2f,\"equity\":%.2f," +
        "\"margin\":%.2f,\"free_margin\":%.2f,\"snapshot_time\":%I64d}]}",
        login, balance, equity, margin, freeMargin, (long)timestamp
    );

    long ts = TimeGMT();
    string headers = SyncHeaders(body, ts);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);

    string url = Inp_ApiBaseURL + "/api/v1/ingest/snapshots";
    if(Inp_DebugSync)
        Print("[Sync Snapshot] POST ", url, " | balance=", DoubleToString(balance, 2),
              " | equity=", DoubleToString(equity, 2), " | 请求字节=", ArraySize(post));

    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
    bool ok = (res == 200);

    if(Inp_DebugSync)
        Print("[Sync Snapshot] ", ok ? "完成" : "失败", ":HTTP=", res,
              " | MT5错误=", webError, " | 响应=", response);

    return ok;
}

// 上传EA配置参数快照
bool SyncHeartbeat()
{
    if(Inp_DebugSync) Print("[Sync Heartbeat] ========== 开始发送心跳 ==========");
    if(!Inp_EnableSync)
    {
        if(Inp_DebugSync) Print("[Sync Heartbeat] 跳过:订单同步未启用");
        return false;
    }
    if(Inp_SecretKey == "")
    {
        if(Inp_DebugSync) Print("[Sync Heartbeat] 失败:账户密钥为空");
        return false;
    }

    long login = AccountInfoInteger(ACCOUNT_LOGIN);
    string body = StringFormat("{\"mt5_login\":%I64d}", login);

    long timestamp = TimeGMT();
    string headers = SyncHeaders(body, timestamp);

    char post[], result[];
    StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
    ArrayResize(post, ArraySize(post) - 1);

    string url = Inp_ApiBaseURL + "/api/v1/ingest/heartbeat";
    if(Inp_DebugSync)
        Print("[Sync Heartbeat] POST ", url, " | 账户=", login, " | 请求字节=", ArraySize(post));

    string responseHeaders = "";
    ResetLastError();
    int res = WebRequest("POST", url, headers, Inp_RequestTimeoutMS, post, result, responseHeaders);
    int webError = GetLastError();
    string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
    bool ok = (res == 200);

    if(Inp_DebugSync)
        Print("[Sync Heartbeat] ", ok ? "完成" : "失败", ":HTTP=", res,
              " | MT5错误=", webError, " | 响应=", response);

    return ok;
}


// 上传主 EA 发布的无密钥实例清单。
// 当前服务器仍使用账户级旧 schema，因此只上传最近活跃实例，并在本地补充 sync 分类。
bool SyncSettings()
{
   if(!Inp_EnableSync || Inp_SecretKey=="") return false;
   string fileName="";
   string filter="TradeEZ\\instances\\"+(string)AccountInfoInteger(ACCOUNT_LOGIN)+"_*.json";
   long finder=FileFindFirst(filter,fileName,0);
   if(finder==INVALID_HANDLE)
   {
      if(Inp_DebugSync) Print("[Sync Settings] 未发现主 EA 实例清单");
      return true;
   }

   string latestFile="";
   datetime latestModified=0;
   do
   {
      string path="TradeEZ\\instances\\"+fileName;
      datetime modified=(datetime)FileGetInteger(path,FILE_MODIFY_DATE,false);
      if(latestFile=="" || modified>latestModified)
      {
         latestFile=fileName;
         latestModified=modified;
      }
   }
   while(FileFindNext(finder,fileName));
   FileFindClose(finder);

   if(latestFile=="") return true;
   string latestPath="TradeEZ\\instances\\"+latestFile;
   int h=FileOpen(latestPath,FILE_READ|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(h==INVALID_HANDLE)
   {
      if(Inp_DebugSync) Print("[Sync Settings] 无法读取 ",latestFile," 错误=",GetLastError());
      return false;
   }
   string manifest=FileReadString(h,(int)FileSize(h));
   FileClose(h);

   string marker="\"settings\":";
   int markerPos=StringFind(manifest,marker);
   int settingsStart=(markerPos>=0 ? StringFind(manifest,"{",markerPos+StringLen(marker)) : -1);
   int outerEnd=StringLen(manifest)-1;
   while(outerEnd>=0 && StringGetCharacter(manifest,outerEnd)<=32) outerEnd--;
   if(settingsStart<0 || outerEnd<=settingsStart || StringGetCharacter(manifest,outerEnd)!='}')
   {
      if(Inp_DebugSync) Print("[Sync Settings] 实例清单格式无效: ",latestFile);
      return false;
   }

   // 排除清单最外层右花括号，取得完整 settings 对象。
   string settings=StringSubstr(manifest,settingsStart,outerEnd-settingsStart);
   if(StringLen(settings)<2 || StringGetCharacter(settings,StringLen(settings)-1)!='}')
   {
      if(Inp_DebugSync) Print("[Sync Settings] settings 对象不完整: ",latestFile);
      return false;
   }
   settings=StringSubstr(settings,0,StringLen(settings)-1);
   settings += ",\"sync\":{";
   settings += "\"enable\":" + (Inp_EnableSync ? "true" : "false") + ",";
   settings += "\"api_base_url\":\"" + JsonEscape(Inp_ApiBaseURL) + "\",";
   settings += "\"sync_interval_min\":" + (string)Inp_SyncIntervalMin + ",";
   settings += "\"request_timeout_ms\":" + (string)Inp_RequestTimeoutMS + ",";
   settings += "\"max_batch_size\":" + (string)Inp_MaxBatchSize + ",";
   settings += "\"debug\":" + (Inp_DebugSync ? "true" : "false") + "}}";

   long login=AccountInfoInteger(ACCOUNT_LOGIN);
   long ts=TimeGMT();
   string body=StringFormat("{\"mt5_login\":%I64d,\"snapshot_time\":%I64d,\"settings\":%s}",
                            login,ts,settings);
   string headers=SyncHeaders(body,ts);
   char post[],result[];
   StringToCharArray(body,post,0,WHOLE_ARRAY,CP_UTF8);
   if(ArraySize(post)>0) ArrayResize(post,ArraySize(post)-1);
   string responseHeaders="";
   ResetLastError();
   int res=WebRequest("POST",Inp_ApiBaseURL+"/api/v1/ingest/settings",
                      headers,MathMax(500,Inp_RequestTimeoutMS),post,result,responseHeaders);
   int webError=GetLastError();
   string response=CharArrayToString(result,0,WHOLE_ARRAY,CP_UTF8);
   bool ok=(res>=200 && res<300);
   if(Inp_DebugSync)
      Print("[Sync Settings] ",latestFile," ",ok ? "完成" : "失败",
            " HTTP=",res," MT5错误=",webError," 响应=",response);
   return ok;
}


int RetryDelaySeconds()
{
   if(g_RetryLevel<=0) return 5;
   if(g_RetryLevel==1) return 15;
   if(g_RetryLevel==2) return 60;
   return 300;
}

bool RunFullSync(string reason)
{
   if(!g_HasLease || g_SyncInProgress) return false;
   if(!Inp_EnableSync)
   {
      SetServiceState(SERVICE_DISABLED,"请在参数中启用同步服务");
      return false;
   }
   if(Inp_SecretKey=="")
   {
      SetServiceState(SERVICE_CONFIG_ERROR,"请配置服务器下发的账户密钥");
      return false;
   }

   SetServiceState(SERVICE_BUSY,reason);
   RenderSyncPanel();
   bool symbolsOK=SyncSymbols();
   bool dealsOK=SyncDeals();
   bool snapshotOK=SyncSnapshot();
   bool settingsOK=SyncSettings();
   bool heartbeatOK=SyncHeartbeat();
   bool ok=symbolsOK && dealsOK && snapshotOK && settingsOK && heartbeatOK;
   if(ok)
   {
      g_LastSuccessUtc=TimeGMT();
      g_RetryLevel=0;
      g_NextRetryUtc=0;
      SetServiceState(SERVICE_IDLE,"全部同步任务已完成");
   }
   else
   {
      int delay=RetryDelaySeconds();
      g_RetryLevel++;
      g_NextRetryUtc=TimeGMT()+delay;
      SetServiceState(SERVICE_ERROR,"部分任务失败，"+(string)delay+" 秒后重试");
   }
   RenderSyncPanel();
   return ok;
}

long BeijingDayKey()
{
   return (long)((TimeGMT()+8*3600)/86400);
}

int OnInit()
{
   ChartSetInteger(0,CHART_EVENT_OBJECT_CREATE,true);
   g_HasLease=AcquireLease();
   if(!g_HasLease)
      SetServiceState(SERVICE_DUPLICATE,"同一账户只允许一个同步服务实例");
   else if(!Inp_EnableSync)
      SetServiceState(SERVICE_DISABLED,"请在参数中启用同步服务");
   else if(Inp_SecretKey=="")
      SetServiceState(SERVICE_CONFIG_ERROR,"请配置服务器下发的账户密钥");
   else
      SetServiceState(SERVICE_IDLE,"等待首次同步");

   g_LastDailyKey=BeijingDayKey();
   RenderSyncPanel();
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ReleaseLease();
   ObjectsDeleteAll(0,SYNC_PREFIX);
   ChartRedraw();
}

void OnTick() {}

void OnTimer()
{
   if(!g_HasLease)
   {
      RenderSyncPanel();
      return;
   }
   RenewLease();
   if(!g_HasLease) { RenderSyncPanel(); return; }

   if(g_ManualConfirm && TimeCurrent()>g_ManualConfirmUntil)
      g_ManualConfirm=false;

   if(!Inp_EnableSync || Inp_SecretKey=="")
   {
      SetServiceState(!Inp_EnableSync ? SERVICE_DISABLED : SERVICE_CONFIG_ERROR,
                      !Inp_EnableSync ? "请在参数中启用同步服务" : "请配置服务器下发的账户密钥");
      RenderSyncPanel();
      return;
   }

   if(g_NextRetryUtc>0 && TimeGMT()>=g_NextRetryUtc)
   {
      RunFullSync("网络恢复重试");
      return;
   }

   long dayKey=BeijingDayKey();
   if(g_StartupPending || dayKey!=g_LastDailyKey)
   {
      g_StartupPending=false;
      g_LastDailyKey=dayKey;
      RunFullSync(dayKey==BeijingDayKey() ? "启动/每日完整同步" : "每日完整同步");
      return;
   }

   g_DealsCounter++;
   g_SnapshotCounter++;
   g_HeartbeatCounter++;
   g_SettingsCounter++;

   if(g_DealsCounter>=MathMax(1,Inp_SyncIntervalMin*60))
   {
      g_DealsCounter=0;
      SetServiceState(SERVICE_BUSY,"同步新增成交");
      RenderSyncPanel();
      bool ok=SyncDeals();
      if(ok) { g_LastSuccessUtc=TimeGMT(); SetServiceState(SERVICE_IDLE,"成交同步完成"); }
      else { g_NextRetryUtc=TimeGMT()+RetryDelaySeconds(); g_RetryLevel++; SetServiceState(SERVICE_ERROR,"成交同步失败，等待重试"); }
   }
   else if(g_SnapshotCounter>=MathMax(5,Inp_SnapshotSeconds))
   {
      g_SnapshotCounter=0;
      SetServiceState(SERVICE_BUSY,"上传账户快照");
      RenderSyncPanel();
      bool ok=SyncSnapshot();
      if(ok) { g_LastSuccessUtc=TimeGMT(); SetServiceState(SERVICE_IDLE,"账户快照已更新"); }
      else SetServiceState(SERVICE_ERROR,"账户快照上传失败");
   }
   else if(g_HeartbeatCounter>=MathMax(30,Inp_HeartbeatSeconds))
   {
      g_HeartbeatCounter=0;
      SetServiceState(SERVICE_BUSY,"发送服务心跳");
      RenderSyncPanel();
      bool ok=SyncHeartbeat();
      if(ok) { g_LastSuccessUtc=TimeGMT(); SetServiceState(SERVICE_IDLE,"服务心跳正常"); }
      else SetServiceState(SERVICE_ERROR,"服务心跳失败");
   }
   else if(g_SettingsCounter>=MathMax(1,Inp_SettingsMinutes)*60)
   {
      g_SettingsCounter=0;
      SetServiceState(SERVICE_BUSY,"上传实例参数");
      RenderSyncPanel();
      bool ok=SyncSettings();
      if(ok) { g_LastSuccessUtc=TimeGMT(); SetServiceState(SERVICE_IDLE,"实例参数已更新"); }
      else SetServiceState(SERVICE_ERROR,"实例参数上传失败");
   }
   RenderSyncPanel();
}

void OnChartEvent(const int id,const long &lparam,const double &dparam,const string &sparam)
{
   if(id!=CHARTEVENT_OBJECT_CLICK) return;
   if(sparam==SYNC_PREFIX+"Cancel")
   {
      g_ManualConfirm=false;
      RenderSyncPanel();
      return;
   }
   if(sparam!=SYNC_PREFIX+"Manual") return;
   ObjectSetInteger(0,sparam,OBJPROP_STATE,false);
   if(!Inp_EnableSync || Inp_SecretKey=="" || !g_HasLease || g_ServiceState==SERVICE_BUSY)
      return;

   if(!g_ManualConfirm)
   {
      g_ManualConfirm=true;
      g_ManualConfirmUntil=TimeCurrent()+10;
      g_ServiceDetail="手动同步会阻塞本同步 EA，但不会阻塞主交易 EA；请再次确认";
      RenderSyncPanel();
      return;
   }

   g_ManualConfirm=false;
   RunFullSync("用户手动同步");
}
