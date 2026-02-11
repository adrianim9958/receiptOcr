/**
 * 결제자 1명이 전액 결제했다고 가정한 정산.
 * @returns {{ total: number, rows: Array<{ person: string, owed: number, payToPayer: number }> }}
 */
export function computeSettlement({ items, participants, payer }) {
    const ps = participants.filter(Boolean);
    const owed = Object.fromEntries(ps.map((p) => [p, 0]));

    let total = 0;

    for (const it of items || []) {
        const amt = Math.round(Number(it.amount || 0));
        if (!amt) continue;

        total += amt;

        const assigneesRaw = Array.isArray(it.assignees) ? it.assignees : [];
        const assignees = assigneesRaw.length ? assigneesRaw.filter((a) => ps.includes(a)) : ps;

        if (!assignees.length) continue;
        const share = amt / assignees.length;

        for (const a of assignees) owed[a] += share;
    }

    // 원 단위 반올림 + 결제자에게 오차 몰아주기
    const rounded = {};
    let sumRounded = 0;
    for (const p of ps) {
        rounded[p] = Math.round(owed[p]);
        sumRounded += rounded[p];
    }
    const diff = total - sumRounded;
    if (payer && rounded[payer] != null) rounded[payer] += diff;

    const rows = ps.map((p) => ({
        person: p,
        owed: rounded[p] ?? 0,
        payToPayer: p === payer ? 0 : Math.max(0, rounded[p] ?? 0),
    }));

    return { total, rows };
}
