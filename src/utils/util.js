

/** (선택) 브라우저에서 이미지 리사이즈 후 base64 추출 */
/** (추천) 브라우저에서 이미지 리사이즈 + 자동 회전 후 base64 추출 */
export async function fileToBase64Resized(file, maxWidth = 1600) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
        .catch(() => createImageBitmap(file));

    const w0 = bitmap.width;
    const h0 = bitmap.height;

    // 영수증은 보통 "세로가 긴" 형태 → 가로가 더 길면 90도 회전
    const rotate90 = w0 > h0 * 1.15;

    // 90도 회전하면 결과 캔버스 가로/세로가 바뀜
    const targetW = rotate90 ? h0 : w0;
    const targetH = rotate90 ? w0 : h0;

    const scale = Math.min(1, maxWidth / targetW);
    const outW = Math.round(targetW * scale);
    const outH = Math.round(targetH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    ctx.save();
    if (rotate90) {
        // ✅ CCW 90도 회전(가장 흔한 “누워 찍힌 영수증” 보정)
        ctx.translate(0, outH);
        ctx.rotate(-Math.PI / 2);

        // 회전 좌표계에서 drawImage는 (원본 w0, h0)를 사용
        ctx.drawImage(bitmap, 0, 0, Math.round(w0 * scale), Math.round(h0 * scale));
    } else {
        ctx.drawImage(bitmap, 0, 0, outW, outH);
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { base64: dataUrl.split(",")[1], width: outW, height: outH, rotated: rotate90 };
}


/** 아주 단순 파서: "품목명 ... 12,000" 라인에서 추출 */
export function parseReceiptLines(text) {
    const lines = (text || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

    const priceRe = /(\d{1,3}(?:,\d{3})*|\d+)\s*원?$/;
    const ignoreRe =
        /(사업자|대표|전화|TEL|주소|카드|승인|부가세|VAT|매장|포인트|영수증|거래일|주문|No\.?|단말|가맹|합계|총액|과세|면세)/i;

    const out = [];
    for (const line of lines) {
        if (ignoreRe.test(line)) continue;

        const m = line.match(priceRe);
        if (!m) continue;

        const amount = Number(String(m[1]).replaceAll(",", ""));
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const name = line.replace(priceRe, "").trim();
        if (!name || name.length < 2) continue;

        out.push({ name, amount });
    }
    return out;
}



export { computeSettlement } from "./settlement.js";

/**
 * 영수증 라인에서
 * - amount: 품목 리스트
 * - evidence: 총합계(확실한) 라인 원문
 * 을 반환한다.
 *
 * 사용:
 *   const { amount, evidence } = extractTotalAmount(lines);
 */
export function extractTotalAmount(input) {
    const lines = Array.isArray(input)
        ? input.map(s => String(s ?? "").trim()).filter(Boolean)
        : String(input || "").split("\n").map(s => s.trim()).filter(Boolean);

    const normalize = (s) => {
        let x = String(s ?? "").replace(/\s+/g, " ").trim();
        // 136.00021 -> 136.000 (꼬리 쓰레기 제거)
        x = x.replace(/\b(\d{1,3})\.(\d{3})(\d{1,2})\b/g, "$1.$2");
        x = x.replace(/\b(\d{1,3}),(\d{3})(\d{1,2})\b/g, "$1,$2");
        // 48.000 -> 48,000
        const dotThousand = /(\d)\.(\d{3})(?!\d)/g;
        while (dotThousand.test(x)) x = x.replace(dotThousand, "$1,$2");
        return x;
    };

    // "돈" 토큰만 잡기 (수량 1~3자리, 승인/가맹/전화번호 같은 긴 번호는 제외)
    const moneyTokens = (line) => {
        const s = normalize(line);
        const re = /(?:₩\s*)?([0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]{1,})\s*원?/g;
        const out = [];
        for (const m of s.matchAll(re)) {
            const token = m[0];
            const raw = m[1];
            const digits = raw.replace(/[,.]/g, "");
            if (!/^\d+$/.test(digits)) continue;

            const hasSep = /[,.]/.test(raw);
            const hasCurrency = /₩/.test(token) || /원/.test(token);

            // 콤마/점/원표시 없이 1~3자리 => 수량 가능성 ↑
            if (!hasSep && !hasCurrency && digits.length <= 3) continue;

            // 날짜(YYYYMMDD) / 연도(20xx) 오인 방지
            const num = Number(digits);
            if (!hasSep && !hasCurrency && num >= 1900 && num <= 2099) continue;
            if (!hasSep && !hasCurrency && digits.length === 8 && (digits.startsWith("19") || digits.startsWith("20"))) continue;

            // 콤마 없는 8자리 이상 => 승인/가맹/전화번호 가능성 ↑
            if (!hasSep && !hasCurrency && digits.length >= 8) continue;

            if (!Number.isFinite(num) || num < 1 || num > 200_000_000) continue;

            out.push(num);
        }
        return out;
    };

    // 키워드 기반으로 "총액 후보 라인" 점수화
    const keywords = [
        { re: /(합\s*계\s*금\s*액|합계\s*금액|합\s*계|합계)/i, w: 260 },
        { re: /(승인\s*금액|승인금액)/i, w: 250 },
        { re: /(거래\s*금액|거래금액|결제\s*금액|결제금액|금액\s*결제|금액결제)/i, w: 240 },
        { re: /(신용\s*카드|체크\s*카드|카드\s*결제|카드결제)/i, w: 150 }, // 카드/결제 라인에 총액이 같이 붙는 경우
        { re: /(총\s*액|총액|총\s*계|총계)/i, w: 200 },
    ];

    const badContext = /(부가세|세액|공급가액|과세물품가액|가액|면세|할인|포인트|잔액)/i;

    let best = { score: -1, total: 0, evidence: "" };

    for (let i = 0; i < lines.length; i++) {
        const line0 = normalize(lines[i]);
        if (!line0) continue;

        let kwW = -1;
        for (const k of keywords) {
            if (k.re.test(line0)) { kwW = k.w; break; }
        }
        if (kwW < 0) continue;

        // 같은 라인에서 금액 찾기
        const m0 = moneyTokens(line0);
        if (m0.length) {
            const total = m0[m0.length - 1];
            const penalty = badContext.test(line0) ? 60 : 0;
            const posScore = (i / Math.max(1, lines.length - 1)) * 25; // 아래쪽 가점
            const score = kwW + posScore - penalty;
            if (score > best.score) best = { score, total, evidence: line0 };
            continue;
        }

        // 금액이 다음/이전 줄로 떨어진 케이스 (예: "승인 금액:" 다음 줄에 "20,000")
        for (const d of [1, 2, -1, -2]) {
            const j = i + d;
            if (j < 0 || j >= lines.length) continue;
            const near = normalize(lines[j]);
            const m1 = moneyTokens(near);
            if (!m1.length) continue;

            const total = m1[m1.length - 1];
            const penalty = badContext.test(near) ? 40 : 0;
            const posScore = (i / Math.max(1, lines.length - 1)) * 20;
            const score = kwW + posScore - penalty - Math.abs(d) * 5;

            const evidence = `${line0} ${total.toLocaleString("ko-KR")}원`;
            if (score > best.score) best = { score, total, evidence };
            break;
        }
    }

    // 키워드 라인 실패 시 fallback: 문서에서 가장 큰 “돈” 토큰
    if (best.score < 0) {
        let max = 0;
        let ev = "";
        for (let i = 0; i < lines.length; i++) {
            const line0 = normalize(lines[i]);
            const ms = moneyTokens(line0);
            for (const v of ms) {
                if (v > max) { max = v; ev = line0; }
            }
        }
        return { amount: max, evidence: ev };
    }

    return { amount: best.total, evidence: best.evidence };
}

export { callVisionAnnotate } from "./vision.js";

export function normalizeReceiptLineOrder(lines) {
    return lines;
}