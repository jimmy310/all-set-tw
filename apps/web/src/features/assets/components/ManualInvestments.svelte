<script lang="ts">
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import { investmentAccountsQuery } from "@/data/investments/queries";
  import { queryKeys } from "@/shared/api/query-keys";
  import type { ApiClient } from "@/shared/api/client";
  import Button from "@/shared/ui/Button.svelte";
  import Input from "@/shared/ui/Input.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import { todayStr } from "@/shared/format/financial";

  let { api }: { api: ApiClient } = $props();
  const qc = useQueryClient();
  const accounts = createQuery(investmentAccountsQuery(() => api));
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
  let currency = $state("USD");
  let custodyStatus = $state("free");
  let asOfDate = $state(todayStr());
  let error = $state("");

  const addAccount = createMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/investment-accounts", {
        provider: provider.trim(),
        displayName: accountName.trim(),
        accountType,
        maskedIdentity: maskedIdentity.trim() || null,
        currency: accountCurrency,
        market: market.trim() || null,
      }),
    onSuccess: (result) => {
      accountId = result.id;
      qc.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
      error = "";
    },
  });
  const addPosition = createMutation({
    mutationFn: () =>
      api.post("/api/investments/manual", {
        accountId,
        assetType,
        symbol: symbol.trim() || null,
        name: name.trim(),
        quantity: quantity === "" ? null : Number(quantity),
        marketValue: marketValue === "" ? null : Number(marketValue),
        currency,
        custodyStatus,
        asOfDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.investments });
      name = "";
      symbol = "";
      quantity = "";
      marketValue = "";
      error = "";
    },
  });
  function savePosition() {
    if (!accountId || !name.trim() || (quantity === "" && marketValue === "")) {
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
      <h3 class="font-medium">投資帳戶</h3>
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
        >新增帳戶</Button
      >
    </form>
    <form
      class="grid content-start gap-3 rounded-lg bg-ink/3 p-4"
      onsubmit={(event) => {
        event.preventDefault();
        savePosition();
      }}
    >
      <h3 class="font-medium">持倉快照</h3>
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
        <Input
          aria-label="持有數量"
          type="number"
          min="0"
          step="any"
          placeholder="持有數量"
          bind:value={quantity}
        />
        <Input
          aria-label="市值"
          type="number"
          min="0"
          step="1"
          placeholder="市值（可留空）"
          bind:value={marketValue}
        />
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
      <Button
        type="submit"
        variant="primary"
        disabled={$addPosition.isPending || $accounts.isPending}
        >新增持倉</Button
      >
    </form>
  </div>
  {#if error}<p class="mt-3 text-sm text-coral" role="alert">{error}</p>{/if}
</details>
