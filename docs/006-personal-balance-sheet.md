# 個人資產負債表與手動投資

個人資產負債表使用 `calculatePersonalBalanceSheet` 作為 Overview 與資產清冊的共同聚合契約。未知餘額與缺少外幣匯率不會轉成零；在必要資產或負債無法估值時，淨值顯示為資料不完整。信用卡與貸款均列入負債。抵押關係只描述擔保品，不會從資產移除擔保品，也不會取代貸款本金。

投資部位保留 connector/source ID、投資帳戶、保管狀態及快照日。手動投資帳戶各自選取最新資產類別快照；尚未映射到投資帳戶的舊 connector 資料維持 connector 範圍，包含既有 TDCC 快照行為。

跨來源持倉只會在使用者設定相同 `economicSecurityId` 後合併。`complete` 觀測優先於同組 `subset`；若同組皆為 subset，價值會在幣別一致且資料完整時相加。系統不以股票代號推斷重疊。來源事實與 provenance 保留在各自的持倉列。

選擇權以獨立 `option` asset type 儲存標的、到期日、履約價、Call/Put、合約乘數與外部合約代號。數量可正可負。`market_value` 是來源提供或手動輸入的整數總部位市值；若只提供單位權利金，手動流程以 `quantity × contractMultiplier × optionMarkPrice` 計算並四捨五入至最接近的整數幣別單位。乘數、履約價、數量與單位權利金以 SQLite REAL 儲存。短部位的負市值作為衍生品負債列示，不會被截成零或併入貸款本金。交易只預留識別欄位，不實作稅務 lot 或交易功能。
