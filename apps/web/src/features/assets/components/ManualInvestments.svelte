<script lang="ts">
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import {
    investmentAccountsQuery,
    investmentsQuery,
  } from "@/data/investments/queries";
  import { queryKeys } from "@/shared/api/query-keys";
  import type { ApiClient } from "@/shared/api/client";
  import type {
    InvestmentAccountRow,
    InvestmentRow,
  } from "@/data/investments/types";
  import Button from "@/shared/ui/Button.svelte";
  import Input from "@/shared/ui/Input.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import { formatNumber, todayStr } from "@/shared/format/financial";

  let { api }: { api: ApiClient } = $props();
  const qc = useQueryClient();
  const accounts = createQuery(investmentAccountsQuery(() => api));
  const positions = createQuery(investmentsQuery(() => api));
  let provider = $state("");
  let accountName = $state("");
  let accountType = $state("brokerage");
  let maskedIdentity = $state("");
  let accountCurrency = $state("USD");
  let market = $state("US");
  let accountId = $state("");
  let assetType = $state("stock");
  let symbol = $state("");
  let name = $state("");
  let quantity = $state("");
  let marketValue = $state("");
  let cashBalance = $state("");
  let currency = $state("USD");
  let custodyStatus = $state("free");
  let asOfDate = $state(todayStr());
  let error = $state("");
  let editingAccountId = $state<string | null>(null);
  let editingPositionId = $state<string | null>(null);
  let underlyingSymbol = $state("");
  let expirationDate = $state("");
  let strikePrice = $state("");
  let optionRight = $state("call");
  let contractMultiplier = $state("100");
  let contractSymbol = $state("");
  let optionMarkPrice = $state("");
  let averageCost = $state("");
  let costBasis = $state("");
  let reconciliationPositionId = $state("");
  let economicSecurityId = $state("");
  let observationCoverage = $state("complete");

  const addAccount = createMutation<{ id: string } | { success: boolean }>({
    mutationFn: () =>
      editingAccountId
        ? api.put<{ success: boolean }>(
            `/api/investment-accounts/${editingAccountId}`,
            {
              provider: provider.trim(),
              displayName: accountName.trim(),
              accountType,
              maskedIdentity: maskedIdentity.trim() || null,
              currency: accountCurrency,
              market: market.trim() || null,
            },
          )
        : api.post<{ id: string }>("/api/investment-accounts", {
            provider: provider.trim(),
            displayName: accountName.trim(),
            accountType,
            maskedIdentity: maskedIdentity.trim() || null,
            currency: accountCurrency,
            market: market.trim() || null,
          }),
    onSuccess: (result) => {
      if ("id" in result) accountId = result.id;
      editingAccountId = null;
      provider = "";
      accountName = "";
      maskedIdentity = "";
      qc.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
      error = "";
    },
  });
  const removeAccount = createMutation({
    mutationFn: (id: string) => api.delete(`/api/investment-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
      error = "";
    },
    onError: () => {
      error = "帳戶仍有持倉，請先刪除或移動持倉。";
    },
  });
  const addPosition = createMutation<{ id: string } | { success: boolean }>({
    mutationFn: () => {
      const body = {
        accountId,
        assetType,
        symbol: symbol.trim() || null,
        name: name.trim(),
        quantity:
          assetType === "cash" || quantity === "" ? null : Number(quantity),
        marketValue:
          assetType === "cash" || marketValue === ""
            ? null
            : Number(marketValue),
        cashBalance:
          assetType !== "cash" || cashBalance === ""
            ? null
            : Number(cashBalance),
        currency,
        averageCost: averageCost === "" ? null : Number(averageCost),
        costBasis: costBasis === "" ? null : Number(costBasis),
        custodyStatus,
        asOfDate,
        underlyingSymbol:
          assetType === "option" ? underlyingSymbol.trim() || null : null,
        expirationDate: assetType === "option" ? expirationDate || null : null,
        strikePrice:
          assetType === "option" && strikePrice !== ""
            ? Number(strikePrice)
            : null,
        optionRight: assetType === "option" ? optionRight : null,
        contractMultiplier:
          assetType === "option" ? Number(contractMultiplier || "100") : 1,
        contractSymbol:
          assetType === "option" ? contractSymbol.trim() || null : null,
        optionMarkPrice:
          assetType === "option" && optionMarkPrice !== ""
            ? Number(optionMarkPrice)
            : null,
      };
      return editingPositionId
        ? api.put<{ success: boolean }>(
            `/api/investments/manual/${editingPositionId}`,
            body,
          )
        : api.post<{ id: string }>("/api/investments/manual", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.investments });
      editingPositionId = null;
      name = "";
      symbol = "";
      quantity = "";
      marketValue = "";
      cashBalance = "";
      underlyingSymbol = "";
      expirationDate = "";
      strikePrice = "";
      contractSymbol = "";
      optionMarkPrice = "";
      error = "";
    },
  });
  const removePosition = createMutation({
    mutationFn: (id: string) => api.delete(`/api/investments/manual/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.investments }),
    onError: () => {
      error = "此持倉已連結為抵押品，請先解除抵押連結。";
    },
  });
  const linkReconciliation = createMutation({
    mutationFn: () =>
      api.put(`/api/investments/${reconciliationPositionId}/reconciliation`, {
        economicSecurityId: economicSecurityId.trim() || null,
        observationCoverage,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.investments }),
  });
  function editAccount(account: InvestmentAccountRow) {
    editingAccountId = account.id;
    provider = account.provider;
    accountName = account.displayName;
    accountType = account.accountType;
    maskedIdentity = account.maskedIdentity ?? "";
    accountCurrency = account.currency;
    market = account.market ?? "";
  }
  function editPosition(position: InvestmentRow) {
    editingPositionId = position.id;
    accountId = position.investmentAccountId ?? "";
    assetType = position.assetType;
    symbol = position.symbol ?? "";
    name = position.name;
    quantity = position.quantity == null ? "" : String(position.quantity);
    marketValue =
      position.marketValue == null ? "" : String(position.marketValue);
    cashBalance =
      position.cashBalance == null ? "" : String(position.cashBalance);
    currency = position.currency;
    custodyStatus = position.custodyStatus ?? "free";
    asOfDate = position.asOfDate;
    underlyingSymbol = position.underlyingSymbol ?? "";
    expirationDate = position.expirationDate ?? "";
    strikePrice =
      position.strikePrice == null ? "" : String(position.strikePrice);
    optionRight = position.optionRight ?? "call";
    contractMultiplier = String(
      position.contractMultiplier ??
        (position.assetType === "option" ? 100 : 1),
    );
    contractSymbol = position.contractSymbol ?? "";
    optionMarkPrice =
      position.optionMarkPrice == null ? "" : String(position.optionMarkPrice);
    averageCost =
      position.averageCost == null ? "" : String(position.averageCost);
    costBasis = position.costBasis == null ? "" : String(position.costBasis);
  }
  function savePosition() {
    if (
      !accountId ||
      !name.trim() ||
      (assetType !== "cash" &&
        quantity === "" &&
        marketValue === "" &&
        optionMarkPrice === "")
    ) {
      error = "請選擇投資帳戶，填寫標的名稱，並提供數量或估值。";
      return;
    }
    error = "";
    $addPosition.mutate();
  }
</script>

<details class="rounded-xl border border-border p-4">
  <summary class="cursor-pointer font-semibold">手動新增投資帳戶與持倉</summary>
  <p class="mt-2 text-sm text-subtle">
    可登錄複委託或海外券商資產。只填遮罩帳號；持倉幣別與估值日期會保留。
  </p>
  <div class="mt-4 grid gap-4 lg:grid-cols-2">
    <form
      class="grid content-start gap-3 rounded-lg bg-ink/3 p-4"
      onsubmit={(event) => {
        event.preventDefault();
        $addAccount.mutate();
      }}
    >
      <h3 class="font-medium">
        {editingAccountId ? "編輯投資帳戶" : "投資帳戶"}
      </h3>
      <Input
        aria-label="券商或機構"
        placeholder="券商或機構"
        bind:value={provider}
        maxlength="120"
      />
      <Input
        aria-label="帳戶顯示名稱"
        placeholder="帳戶名稱"
        bind:value={accountName}
        maxlength="120"
      />
      <Select aria-label="帳戶種類" bind:value={accountType}>
        <option value="brokerage">券商</option>
        <option value="sub_brokerage">複委託</option>
        <option value="securities_finance">證券融資／質借</option>
        <option value="other">其他</option>
      </Select>
      <div class="grid grid-cols-2 gap-3">
        <Input
          aria-label="帳戶幣別"
          bind:value={accountCurrency}
          maxlength="3"
          pattern="[A-Z]{3}"
        />
        <Input
          aria-label="市場"
          placeholder="市場，例如 US"
          bind:value={market}
          maxlength="8"
        />
      </div>
      <Input
        aria-label="遮罩帳號"
        placeholder="遮罩帳號（選填，例如 ••1234）"
        bind:value={maskedIdentity}
        maxlength="32"
      />
      <Button type="submit" variant="secondary" disabled={$addAccount.isPending}
        >{editingAccountId ? "更新帳戶" : "新增帳戶"}</Button
      >
      {#if editingAccountId}<Button
          type="button"
          variant="ghost"
          onclick={() => {
            editingAccountId = null;
            provider = "";
            accountName = "";
            maskedIdentity = "";
          }}>取消編輯</Button
        >{/if}
    </form>
    <form
      class="grid content-start gap-3 rounded-lg bg-ink/3 p-4"
      onsubmit={(event) => {
        event.preventDefault();
        savePosition();
      }}
    >
      <h3 class="font-medium">{editingPositionId ? "編輯持倉" : "持倉快照"}</h3>
      <Select aria-label="投資帳戶" bind:value={accountId}>
        <option value="">選擇帳戶</option>
        {#each $accounts.data ?? [] as account (account.id)}
          <option value={account.id}
            >{account.displayName} · {account.provider}{account.maskedIdentity
              ? ` ${account.maskedIdentity}`
              : ""}</option
          >
        {/each}
      </Select>
      <Input
        aria-label="標的名稱"
        placeholder="標的名稱"
        bind:value={name}
        maxlength="120"
      />
      <div class="grid grid-cols-2 gap-3">
        <Input
          aria-label="代號"
          placeholder="代號"
          bind:value={symbol}
          maxlength="40"
        />
        <Select aria-label="資產種類" bind:value={assetType}>
          <option value="stock">股票</option><option value="etf">ETF</option
          ><option value="fund">基金</option><option value="bond">債券</option
          ><option value="option">選擇權</option><option value="cash"
            >現金</option
          ><option value="future">期貨</option><option value="crypto"
            >加密資產</option
          ><option value="other">其他</option>
        </Select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        {#if assetType === "cash"}
          <Input
            aria-label="現金餘額"
            type="number"
            min="0"
            step="any"
            placeholder="現金餘額（可留空代表未知）"
            bind:value={cashBalance}
          />
        {:else}
          <Input
            aria-label="持有數量"
            type="number"
            step="any"
            placeholder="持有數量"
            bind:value={quantity}
          />
          <Input
            aria-label="市值"
            type="number"
            step="1"
            placeholder="市值（可留空）"
            bind:value={marketValue}
          />
        {/if}
      </div>
      <div class="grid grid-cols-3 gap-3">
        <Input
          aria-label="持倉幣別"
          bind:value={currency}
          maxlength="3"
          pattern="[A-Z]{3}"
        />
        <Select aria-label="保管狀態" bind:value={custodyStatus}
          ><option value="free">未設質</option><option value="collateral"
            >擔保品</option
          ><option value="margin">融資</option><option value="restricted"
            >受限制</option
          ></Select
        >
        <Input aria-label="估值日期" type="date" bind:value={asOfDate} />
      </div>
      {#if assetType === "option"}
        <div
          class="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-3"
        >
          <Input
            aria-label="選擇權標的"
            placeholder="標的代號，例如 TSM"
            bind:value={underlyingSymbol}
          />
          <Input aria-label="到期日" type="date" bind:value={expirationDate} />
          <Input
            aria-label="履約價"
            type="number"
            min="0"
            step="any"
            placeholder="履約價"
            bind:value={strikePrice}
          />
          <Select aria-label="買權或賣權" bind:value={optionRight}
            ><option value="call">Call 買權</option><option value="put"
              >Put 賣權</option
            ></Select
          >
          <Input
            aria-label="合約乘數"
            type="number"
            min="0.000001"
            step="any"
            bind:value={contractMultiplier}
          />
          <Input
            aria-label="選擇權合約代號"
            placeholder="合約代號（選填）"
            bind:value={contractSymbol}
          />
          <Input
            aria-label="每單位權利金"
            type="number"
            min="0"
            step="any"
            placeholder="每單位標記價格"
            bind:value={optionMarkPrice}
          />
        </div>
      {/if}
      <div class="grid grid-cols-2 gap-3">
        <Input
          aria-label="平均成本"
          type="number"
          step="any"
          placeholder="平均成本（選填）"
          bind:value={averageCost}
        />
        <Input
          aria-label="成本基礎"
          type="number"
          step="1"
          placeholder="成本基礎（選填）"
          bind:value={costBasis}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        disabled={$addPosition.isPending || $accounts.isPending}
        >{editingPositionId ? "更新持倉" : "新增持倉"}</Button
      >
      {#if editingPositionId}<Button
          type="button"
          variant="ghost"
          onclick={() => {
            editingPositionId = null;
            name = "";
          }}>取消編輯</Button
        >{/if}
    </form>
  </div>
  <div class="mt-4 grid gap-2 md:grid-cols-2">
    {#each $accounts.data ?? [] as account (account.id)}
      <div
        class="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
      >
        <span
          >{account.displayName} · {account.provider}{account.maskedIdentity
            ? ` ${account.maskedIdentity}`
            : ""}</span
        >
        <span class="flex gap-1"
          ><Button
            size="sm"
            variant="ghost"
            onclick={() => editAccount(account)}>編輯</Button
          ><Button
            size="sm"
            variant="ghost"
            onclick={() => $removeAccount.mutate(account.id)}>刪除</Button
          ></span
        >
      </div>
    {/each}
  </div>
  <div class="mt-2 divide-y divide-border">
    {#each ($positions.data ?? []).filter((position) => position.connectorId === "manual") as position (position.id)}
      {@const linkedAccount = ($accounts.data ?? []).find(
        (account) => account.id === position.investmentAccountId,
      )}
      <div class="flex items-center justify-between gap-3 py-2 text-sm">
        <span
          >{position.assetType === "cash"
            ? `${position.name} · ${position.cashBalance == null ? "現金餘額未知" : `${formatNumber(position.cashBalance)} ${position.currency}`}`
            : position.assetType === "option"
              ? `${position.underlyingSymbol ?? "?"} ${position.expirationDate ?? "?"} ${position.strikePrice ?? "?"} ${position.optionRight ?? "option"}`
              : `${position.symbol ?? ""} ${position.name}`} · {position.assetType ===
          "cash"
            ? "現金"
            : position.marketValue == null
              ? "估值未知"
              : `${position.marketValue} ${position.currency}`} · {linkedAccount?.displayName ??
            "帳戶未知"}</span
        >
        <span class="flex gap-1"
          ><Button
            size="sm"
            variant="ghost"
            onclick={() => editPosition(position)}>編輯</Button
          ><Button
            size="sm"
            variant="ghost"
            onclick={() => $removePosition.mutate(position.id)}>刪除</Button
          ></span
        >
      </div>
    {/each}
  </div>
  <form
    class="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
    onsubmit={(event) => {
      event.preventDefault();
      $linkReconciliation.mutate();
    }}
  >
    <Select aria-label="選擇來源持倉" bind:value={reconciliationPositionId}>
      <option value="">選擇來源持倉</option>
      {#each $positions.data ?? [] as position (position.id)}<option
          value={position.id}
          >{position.symbol ?? position.name} · {position.connectorId ??
            position.investmentAccountId ??
            "source"}</option
        >{/each}
    </Select>
    <Input
      aria-label="經濟標的識別"
      placeholder="手動連結識別，例如 TSM-ACCOUNT-01"
      bind:value={economicSecurityId}
    />
    <Select aria-label="觀測範圍" bind:value={observationCoverage}
      ><option value="complete">完整持倉</option><option value="subset"
        >部分／保管觀測</option
      ></Select
    >
    <Button
      type="submit"
      variant="secondary"
      disabled={!reconciliationPositionId || $linkReconciliation.isPending}
      >儲存連結</Button
    >
    <p class="text-caption text-subtle sm:col-span-4">
      只有相同手動識別的來源會合併；完整持倉優先，否則明確標記的部分觀測相加。股票代號相同不會自動合併。
    </p>
  </form>
  {#if error}<p class="mt-3 text-sm text-coral" role="alert">{error}</p>{/if}
</details>
