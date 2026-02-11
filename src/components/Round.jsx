import { useState, useRef, useMemo, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { FileUpload } from "primereact/fileupload";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputNumber } from "primereact/inputnumber";
import { MultiSelect } from "primereact/multiselect";
import { Dropdown } from "primereact/dropdown";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Panel } from "primereact/panel";
import { Message } from "primereact/message";
import { Image } from "primereact/image";

import { fileToBase64Resized, extractTotalAmount, computeSettlement, callVisionAnnotate, normalizeReceiptLineOrder } from "../utils/util";
import { extractLinesByGeometry } from "../utils/line";

/** 합계 행( isTotal ) 제외한 금액 합을 구하고, 합계 행 amount 를 initialAmount - otherSum 으로 갱신한 새 배열 반환 */
function recalcSumRow(items) {
    const nextItems = [...items];
    const sumIdx = nextItems.findIndex((it) => it.isTotal);
    if (sumIdx < 0) return nextItems;
    const sumItem = nextItems[sumIdx];
    const otherSum = nextItems.reduce(
        (acc, it) => (it.isTotal ? acc : acc + (Number(it.amount) || 0)),
        0
    );
    nextItems[sumIdx] = { ...sumItem, amount: (sumItem.initialAmount || 0) - otherSum };
    return nextItems;
}

export default function Round({ data, participants, onUpdate, onDelete }) {
    const fileUploadRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Unpack data or use defaults
    const { items = [], imageSrc = "", rawText = "", evidence = "", payer = "나" } = data;

    const participantOptions = useMemo(
        () => participants.map((p) => ({ label: p, value: p })),
        [participants]
    );

    // Calculate local settlement for this round
    const settlement = useMemo(
        () => computeSettlement({ items, participants, payer }),
        [items, participants, payer]
    );

    // Update parent state helper
    const update = (fields) => {
        onUpdate({ ...data, ...fields });
    };

    async function onUpload({ files }) {
        setError("");
        const file = files?.[0];
        if (!file) return;

        setBusy(true);
        try {
            const url = URL.createObjectURL(file);

            const { base64, width, height } = await fileToBase64Resized(file, 1600);
            const apiData = await callVisionAnnotate(base64);
            const full = apiData?.responses?.[0]?.fullTextAnnotation;

            const rawLines = extractLinesByGeometry(full, { width, height });
            const lines = normalizeReceiptLineOrder(rawLines);
            const { amount: total, evidence } = extractTotalAmount(lines);

            const newItems = [{
                id: uuidv4(),
                name: "합계",
                amount: Number(total || 0),
                initialAmount: Number(total || 0),
                isTotal: true,
                assignees: [],
            }];

            update({
                imageSrc: url,
                rawText: lines.join("\n"),
                evidence: evidence,
                items: newItems
            });

        } catch (e) {
            setError(e?.message || "OCR 실패");
        } finally {
            setBusy(false);
            fileUploadRef.current?.clear();
        }
    }

    const onCellEditComplete = (e) => {
        const { rowData, newValue, field } = e;
        if (rowData.isTotal) return;
        const nextItems = recalcSumRow(
            items.map((it) => (it.id === rowData.id ? { ...it, [field]: newValue } : it))
        );
        update({ items: nextItems });
    };

    const addItem = () => {
        const nextItems = recalcSumRow([
            ...items,
            { id: uuidv4(), name: "품목", amount: 0, assignees: [] },
        ]);
        update({ items: nextItems });
    };

    const deleteItem = (id) => {
        update({ items: recalcSumRow(items.filter((it) => it.id !== id)) });
    };

    // Panel collapse state
    const [collapsed, setCollapsed] = useState(!imageSrc);

    // Auto-open panel when image is uploaded
    useEffect(() => {
        if (imageSrc) {
            setCollapsed(false);
        }
    }, [imageSrc]);


    return (
        <div className="p-2 border-1 surface-border border-round mb-4">
            <div className="flex justify-content-between align-items-center mb-2 bg-bluegray-50 p-2 border-round">
                <h3 className="m-0 text-xl">{data.name}</h3>
                {onDelete && (
                    <Button
                        icon="pi pi-times"
                        severity="danger"
                        text
                        onClick={onDelete}
                        size="small"
                        tooltip="이 차수 삭제"
                    />
                )}
            </div>

            {error && <Message severity="error" text={error} className="mb-3 w-full" />}

            <div className="grid">
                <div className="col-12 xl:col-4">
                    <Panel
                        header="영수증 & OCR"
                        toggleable
                        collapsed={collapsed}
                        onToggle={(e) => setCollapsed(e.value)}
                    >
                        <div className="flex gap-2 align-items-center flex-wrap mb-2">
                            <FileUpload
                                ref={fileUploadRef}
                                mode="basic"
                                name="receipt"
                                accept="image/*"
                                customUpload
                                uploadHandler={onUpload}
                                chooseLabel="이미지 업로드"
                                auto
                                disabled={busy}
                            />
                            {busy && <span>처리 중...</span>}
                        </div>
                        {imageSrc && (
                            <div className="flex flex-column gap-2">
                                <Image src={imageSrc} alt="Receipt" width="100%" preview />
                                {evidence && <small className="block p-1 bg-yellow-50">근거: {evidence}</small>}
                            </div>
                        )}
                        <textarea
                            className="p-inputtext w-full mt-2 text-sm"
                            rows={3}
                            value={rawText}
                            onChange={(e) => update({ rawText: e.target.value })}
                            placeholder="OCR 결과"
                        />
                    </Panel>
                </div>

                <div className="col-12 xl:col-8">
                    <div className="flex gap-3 mb-2 align-items-end">
                        <div className="flex-1">
                            <label className="block mb-1 font-bold">결제자</label>
                            <Dropdown
                                value={payer}
                                options={participantOptions}
                                onChange={(e) => update({ payer: e.value })}
                                placeholder="결제자 선택"
                                className="w-full"
                            />
                        </div>
                        <div className="flex-1 text-right">
                            총액: <span className="text-xl font-bold text-primary">{settlement.total.toLocaleString()}</span>원
                        </div>
                    </div>

                    <DataTable value={items} editMode="cell" dataKey="id" size="small" emptyMessage="내역 없음">
                        <Column field="name" header="품목" style={{ width: '25%' }} editor={(options) => {
                            if (options.rowData.isTotal) return options.value;
                            return <InputText value={options.value} onChange={(e) => options.editorCallback(e.target.value)} />;
                        }} onCellEditComplete={onCellEditComplete} />

                        <Column field="amount" header="금액" style={{ width: '20%' }} editor={(options) => {
                            if (options.rowData.isTotal) return (options.value || 0).toLocaleString();
                            return <InputNumber value={options.value} onValueChange={(e) => options.editorCallback(e.value)} />;
                        }} onCellEditComplete={onCellEditComplete} body={(r) => r.amount.toLocaleString()} />

                        <Column field="assignees" header="할당" style={{ width: '40%' }} body={(r) => r.assignees?.length ? r.assignees.join(", ") : "n빵"} editor={(options) => {
                            if (options.rowData.isTotal) return null;
                            return <MultiSelect value={options.value || []} options={participantOptions} onChange={(e) => options.editorCallback(e.value)} display="comma" />;
                        }} onCellEditComplete={onCellEditComplete} />

                        <Column body={(rowData) => (
                            <Button icon="pi pi-trash" severity="danger" text disabled={rowData.isTotal} onClick={() => deleteItem(rowData.id)} />
                        )} style={{ width: '5rem', textAlign: 'center' }} />
                    </DataTable>

                    <div className="mt-2">
                        <Button label="품목 추가" icon="pi pi-plus"
                            severity="success" size="small" onClick={addItem} />
                    </div>
                </div>
            </div>
        </div>
    );
}
