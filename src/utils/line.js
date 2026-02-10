export function extractLinesByGeometry(fullTextAnnotation, imgSize) {
    const words = flattenWords(fullTextAnnotation, imgSize);
    if (!words.length) return [];

    // 1) 대표 글자 높이(너무 큰 박스는 제외한 trimmed median)
    const hs = words.map(w => w.h).filter(h => h > 0).sort((a, b) => a - b);
    const p90 = hs[Math.floor(hs.length * 0.9)] ?? hs[hs.length - 1] ?? 12;
    const trimmed = hs.filter(h => h <= p90);
    const medianH = trimmed.length ? trimmed[Math.floor(trimmed.length / 2)] : 12;

    // 2) "행(row)" 분리 임계값: medianH의 0.30~0.35가 보통 안전
    //    (지금처럼 여러 행이 합쳐지는 케이스는 임계값이 커서 생김)
    const yTol = Math.max(2, 0.33 * medianH);

    // 3) y 기준 정렬 후, cy 거리만으로 클러스터링
    words.sort((a, b) => (a.cy - b.cy) || (a.minX - b.minX));

    const lines = [];

    for (const w of words) {
        let bestIdx = -1;
        let bestDiff = Infinity;

        for (let i = 0; i < lines.length; i++) {
            const L = lines[i];
            const diff = Math.abs(w.cy - L.cy);
            if (diff <= yTol && diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }

        if (bestIdx === -1) {
            lines.push(makeLine(w));
        } else {
            addWordToLine(lines[bestIdx], w);
        }
    }

    // 4) 위→아래 정렬
    lines.sort((a, b) => a.minY - b.minY);

    // 5) 라인 내 단어를 X순 정렬 후 join
    const spaceTh = 0.22 * medianH;

    return lines
        .map(L => {
            L.words.sort((a, b) => a.minX - b.minX);

            let out = "";
            for (let i = 0; i < L.words.length; i++) {
                const cur = L.words[i];
                if (i === 0) {
                    out += cur.text;
                } else {
                    const prev = L.words[i - 1];
                    const gap = cur.minX - prev.maxX;
                    if (gap > spaceTh) out += " ";
                    out += cur.text;
                }
            }
            return out.trim();
        })
        .filter(Boolean);
}


function makeLine(w) {
    return {
        words: [w],
        minY: w.minY,
        maxY: w.maxY,
        minX: w.minX,
        maxX: w.maxX,
        h: w.h,
        cy: w.cy,
        // 가중치(평균 업데이트용)
        _n: 1,
    };
}

function addWordToLine(L, w) {
    L.words.push(w);
    L.minY = Math.min(L.minY, w.minY);
    L.maxY = Math.max(L.maxY, w.maxY);
    L.minX = Math.min(L.minX, w.minX);
    L.maxX = Math.max(L.maxX, w.maxX);

    const h = L.maxY - L.minY;
    L.h = h > 0 ? h : L.h;

    // 중심 Y는 이동평균
    L._n += 1;
    L.cy = L.cy + (w.cy - L.cy) / L._n;
}

function flattenWords(fullTextAnnotation, imgSize) {
    const out = [];
    const pages = fullTextAnnotation?.pages ?? [];
    for (const page of pages) {
        for (const block of page.blocks ?? []) {
            for (const para of block.paragraphs ?? []) {
                for (const word of para.words ?? []) {
                    const text = (word.symbols ?? []).map(s => s.text ?? "").join("");
                    if (!text) continue;

                    const box = word.boundingBox;
                    const { minX, maxX, minY, maxY } = getBoxMinMax(box, imgSize);
                    const h = Math.max(1, maxY - minY);
                    const cy = (minY + maxY) / 2;

                    out.push({ text, minX, maxX, minY, maxY, h, cy });
                }
            }
        }
    }
    return out;
}

function getBoxMinMax(boundingBox, imgSize) {
    // Vision의 vertex는 (top-left, top-right, bottom-right, bottom-left) 순서가 일반적 :contentReference[oaicite:2]{index=2}
    const verts = boundingBox?.vertices ?? [];
    let xs = [], ys = [];

    for (const v of verts) {
        if (typeof v?.x === "number") xs.push(v.x);
        if (typeof v?.y === "number") ys.push(v.y);
    }

    // 혹시 normalizedVertices 형태면(0~1) width/height로 환산해야 함
    // (환경에 따라 나오는 경우가 있어 안전하게 처리)
    if ((!xs.length || !ys.length) && boundingBox?.normalizedVertices?.length && imgSize?.width && imgSize?.height) {
        const nvs = boundingBox.normalizedVertices;
        xs = nvs.map(v => (v.x ?? 0) * imgSize.width);
        ys = nvs.map(v => (v.y ?? 0) * imgSize.height);
    }

    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;

    return { minX, maxX, minY, maxY };
}
