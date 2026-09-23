# 個人資產負債表與手動投資

個人資產負債表使用 `calculatePersonalBalanceSheet` 作為 Overview 與資產清冊的共同聚合契約。未知餘額與缺少外幣匯率不會轉成零；在必要資產或負債無法估值時，淨值顯示為資料不完整。信用卡與貸款均列入負債。抵押關係只描述擔保品，不會從資產移除擔保品，也不會取代貸款本金。

投資部位保留 connector/source ID、投資帳戶、保管狀態及快照日。手動部位以來源部位 ID 分別選取最新觀測，因此同一帳戶中日期不同的證券不會互相隱藏；connector 快照維持來源既有的資產類別快照語意，包含 TDCC。券商現金以投資帳戶中的 `cash` 部位表示，`cashBalance` 使用原幣金額，未知餘額不會視為零。

Overview、資產清冊、投資摘要及資產負債表共用相同的有效投資觀測 reconciliation。連接器提供的 `economicSecurityId`／coverage 保留於來源快照；使用者連結另存於 `investment_reconciliation_overrides`，不修改連接器來源事實。使用者 override 優先於來源 metadata。override 以 connector 與 `sourcePositionKey`（來源帳戶／保管脈絡中的穩定持倉識別，不含快照日期）跨新快照解析；沒有穩定識別時不建立連結。跨來源持倉只會在有效 `economicSecurityId` 相同後合併。`complete` 觀測優先於同組 `subset`；若同組皆為 subset，價值會在幣別一致且資料完整時相加。系統不以股票代號或 provider 名稱推斷重疊。來源事實與 provenance 保留在各自的持倉列，明細可顯示來源拆分，但摘要不會重複計入來源子集。

選擇權以獨立 `option` asset type 儲存標的、到期日、履約價、Call/Put、合約乘數與外部合約代號。數量可正可負。`market_value` 是來源提供或手動輸入的整數總部位市值；若只提供單位權利金，手動流程以 `quantity × contractMultiplier × optionMarkPrice` 計算並四捨五入至最接近的整數幣別單位。乘數、履約價、數量與單位權利金以 SQLite REAL 儲存。短部位的負市值作為衍生品負債列示，不會被截成零或併入貸款本金。交易只預留識別欄位，不實作稅務 lot 或交易功能。

投資摘要的「投資淨值」包含正向投資資產扣除負向衍生品市值；資產負債表則將正值計入總資產、負值列入衍生品負債。兩者使用同一份已 reconciliation 的觀測資料，不把負衍生品錯列為負資產。
