<script lang="ts">
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import {
    liabilitiesQuery,
    collateralRelationshipsQuery,
    manualAssetsQuery,
  } from "@/data/assets/queries";
  import { investmentsQuery } from "@/data/investments/queries";
  import type { LiabilityRow } from "@/data/assets/types";
  import { queryKeys } from "@/shared/api/query-keys";
  import type { ApiClient } from "@/shared/api/client";
  import Button from "@/shared/ui/Button.svelte";
  import Card from "@/shared/ui/Card.svelte";
  import CardContent from "@/shared/ui/CardContent.svelte";
  import CardHeader from "@/shared/ui/CardHeader.svelte";
  import Input from "@/shared/ui/Input.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import { formatCurrency, todayStr } from "@/shared/format/financial";

  let { api }: { api: ApiClient } = $props();
  const qc = useQueryClient();
  const liabilities = createQuery(liabilitiesQuery(() => api));
  const collateral = createQuery(collateralRelationshipsQuery(() => api));
  const assets = createQuery(manualAssetsQuery(() => api));
  const positions = createQuery(investmentsQuery(() => api));
  const types = {
    mortgage: "房貸",
    personal_loan: "個人信貸",
    securities_backed_loan: "股票質借",
    margin: "融資",
    auto_loan: "車貸",
    other: "其他負債",
  } as const;
  let name = $state("");
  let liabilityType = $state<keyof typeof types>("mortgage");
  let currency = $state("TWD");
  let originalPrincipal = $state("");
  let outstandingPrincipal = $state("");
  let asOfDate = $state(todayStr());
  let editingId = $state<string | null>(null);
  let error = $state("");
  let collateralLiabilityId = $state("");
  let collateralAssetChoice = $state("");
  const collateralChoices = $derived([
    ...($assets.data ?? []).map((asset, index) => ({
      value: `manual-asset-${index}`,
      assetType: "manual_asset",
      assetId: asset.id,
      label: `不動產／其他資產：${asset.name}`,
    })),
    ...($positions.data ?? []).map((position, index) => ({
      value: `investment-position-${index}`,
      assetType: "investment_position",
      assetId: position.id,
      label: `投資：${position.symbol ?? position.name}`,
    })),
  ]);
  const linkCollateral = createMutation({
    mutationFn: () => {
      const choice = collateralChoices.find(
        (item) => item.value === collateralAssetChoice,
      );
      if (!choice) throw new Error("Collateral asset selection is invalid.");
      return api.post("/api/collateral-relationships", {
        liabilityAccountId: collateralLiabilityId,
        assetType: choice.assetType,
        assetId: choice.assetId,
        currency: "TWD",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.collateralRelationships });
      collateralLiabilityId = "";
      collateralAssetChoice = "";
    },
  });
  const unlinkCollateral = createMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/collateral-relationships/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.collateralRelationships }),
  });
  const save = createMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        liabilityType,
        currency,
        originalPrincipal:
          originalPrincipal === "" ? null : Number(originalPrincipal),
        outstandingPrincipal:
          outstandingPrincipal === "" ? null : Number(outstandingPrincipal),
        asOfDate,
      };
      return editingId
        ? api.put(`/api/liabilities/${editingId}`, body)
        : api.post("/api/liabilities", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.liabilities });
      name = "";
      originalPrincipal = "";
      outstandingPrincipal = "";
      editingId = null;
      error = "";
    },
  });
  const remove = createMutation({
    mutationFn: (id: string) => api.delete(`/api/liabilities/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.liabilities }),
  });
  function edit(row: LiabilityRow) {
    editingId = row.id;
    name = row.name;
    liabilityType = row.liabilityType as keyof typeof types;
    currency = row.currency;
    originalPrincipal = row.originalPrincipal?.toString() ?? "";
    outstandingPrincipal = row.outstandingPrincipal?.toString() ?? "";
    asOfDate = row.asOfAt?.slice(0, 10) ?? todayStr();
  }
  function submit() {
    if (
      !name.trim() ||
      (outstandingPrincipal !== "" && Number(outstandingPrincipal) < 0)
    ) {
      error = "請輸入負債名稱與有效的未償本金；留空代表餘額未知。";
      return;
    }
    error = "";
    $save.mutate();
  }
</script>

<Card class="mt-6 border-0 bg-transparent shadow-none">
  <CardHeader class="px-0">
    <h2 class="text-lg font-semibold">負債與貸款</h2>
    <p class="mt-1 text-sm text-subtle">
      擔保資產仍計入資產；只將未償本金列入負債。
    </p>
  </CardHeader>
  <CardContent class="grid gap-5 p-0">
    <form
      class="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
      onsubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="負債名稱"
        placeholder="例如：自住房房貸"
        bind:value={name}
        maxlength="120"
      />
      <Select aria-label="負債種類" bind:value={liabilityType}>
        {#each Object.entries(types) as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </Select>
      <Input
        aria-label="幣別"
        bind:value={currency}
        maxlength="3"
        pattern="[A-Z]{3}"
      />
      <Input
        aria-label="原始本金"
        type="number"
        min="0"
        placeholder="原始本金（選填）"
        bind:value={originalPrincipal}
      />
      <Input
        aria-label="未償本金"
        type="number"
        min="0"
        placeholder="未償本金（空白代表未知）"
        bind:value={outstandingPrincipal}
      />
      <Input aria-label="餘額日期" type="date" bind:value={asOfDate} />
      <div class="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={$save.isPending}
          >{editingId ? "更新負債" : "新增負債"}</Button
        >
        {#if editingId}<Button
            type="button"
            variant="secondary"
            onclick={() => {
              editingId = null;
              name = "";
            }}>取消</Button
          >{/if}
        {#if error}<p class="text-sm text-coral" role="alert">{error}</p>{/if}
      </div>
    </form>
    {#if $liabilities.isPending}
      <p class="text-sm text-subtle">載入負債中…</p>
    {:else if $liabilities.isError}
      <p class="text-sm text-coral">無法載入負債資料。</p>
    {:else if ($liabilities.data ?? []).length === 0}
      <p class="text-sm text-subtle">尚未登錄貸款或其他負債。</p>
    {:else}
      <ul class="divide-y divide-border rounded-xl border border-border">
        {#each $liabilities.data ?? [] as row (row.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p class="font-medium">
                {row.name}<span class="ml-2 text-sm text-subtle"
                  >{types[row.liabilityType as keyof typeof types] ??
                    "其他負債"}</span
                >
              </p>
              <p class="mt-1 text-sm text-subtle">
                未償本金：{row.outstandingPrincipal == null
                  ? "未知"
                  : formatCurrency(row.outstandingPrincipal, row.currency)} · {row.asOfAt?.slice(
                  0,
                  10,
                ) ?? "尚無餘額日期"}
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onclick={() => edit(row)}
                >編輯</Button
              >
              <Button
                variant="ghost"
                size="sm"
                onclick={() => $remove.mutate(row.id)}>刪除</Button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <section
      class="grid gap-3 rounded-xl border border-border p-4"
      aria-label="抵押品連結"
    >
      <h3 class="font-medium">抵押品連結</h3>
      <p class="text-sm text-subtle">
        連結只記錄擔保關係；資產仍計入總資產，貸款仍計入總負債。
      </p>
      <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select aria-label="選擇貸款" bind:value={collateralLiabilityId}>
          <option value="">選擇貸款</option>
          {#each $liabilities.data ?? [] as row (row.id)}<option value={row.id}
              >{row.name}</option
            >{/each}
        </Select>
        <Select aria-label="選擇抵押資產" bind:value={collateralAssetChoice}>
          <option value="">選擇房產或投資持倉</option>
          {#each collateralChoices as item (item.value)}<option
              value={item.value}>{item.label}</option
            >{/each}
        </Select>
        <Button
          disabled={!collateralLiabilityId ||
            !collateralAssetChoice ||
            $linkCollateral.isPending}
          onclick={() => $linkCollateral.mutate()}>連結</Button
        >
      </div>
      {#if ($collateral.data ?? []).length === 0}<p class="text-sm text-subtle">
          尚無抵押品連結。
        </p>{:else}
        <ul class="divide-y divide-border">
          {#each $collateral.data ?? [] as relation (relation.id)}
            {@const asset = collateralChoices.find(
              (item) =>
                item.assetType === relation.assetType &&
                item.assetId === relation.assetId,
            )}
            <li class="flex items-center justify-between gap-3 py-2 text-sm">
              <span
                >{($liabilities.data ?? []).find(
                  (row) => row.id === relation.liabilityAccountId,
                )?.name ?? "貸款"} ← {asset?.label ?? relation.assetType}</span
              >
              <Button
                variant="ghost"
                size="sm"
                onclick={() => $unlinkCollateral.mutate(relation.id)}
                >解除</Button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </CardContent>
</Card>
