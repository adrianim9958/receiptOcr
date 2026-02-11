import { Panel } from "primereact/panel";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Tag } from "primereact/tag";
import { Accordion, AccordionTab } from "primereact/accordion";
import { Message } from "primereact/message";

export default function SettlementPanel({ rounds, grandTotal, roundDetails }) {
  const hasRoundsWithoutPayer = rounds.some((r) => !r.payer?.trim());

  return (
    <Panel header="최종 정산 (모든 차수 합산)" className="mb-3">
      {hasRoundsWithoutPayer && (
        <Message
          severity="warn"
          text="결제자가 지정되지 않은 차수가 있습니다."
          className="mb-2 w-full"
        />
      )}
      <DataTable value={grandTotal} size="small" stripedRows>
        <Column field="person" header="이름" />
        <Column
          field="net"
          header="정산금"
          body={(r) => {
            const val = r.net;
            const color = val >= 0 ? "text-primary" : "text-pink-500";
            const text =
              val >= 0
                ? `받을 돈 ${val.toLocaleString()}`
                : `보낼 돈 ${Math.abs(val).toLocaleString()}`;
            return <span className={`font-bold ${color}`}>{text}</span>;
          }}
        />
      </DataTable>
      {roundDetails.length > 0 && (
        <div className="mt-3">
          <span className="font-semibold text-sm block mb-2">차수별 내역</span>
          <Accordion multiple activeIndex={[0]} className="border-none">
            {roundDetails.map((detail) => (
              <AccordionTab
                key={detail.roundIndex}
                header={
                  <span>
                    <strong>{detail.roundName}</strong>
                    <span className="ml-2 text-color-secondary text-sm">
                      총 {detail.total.toLocaleString()}원
                      {detail.payer?.trim()
                        ? ` · 결제: ${detail.payer}`
                        : " · 결제자 없음"}
                    </span>
                  </span>
                }
              >
                <DataTable
                  value={detail.rows}
                  size="small"
                  stripedRows
                  className="p-datatable-sm"
                >
                  <Column field="person" header="이름" />
                  <Column
                    field="owed"
                    header="부담액"
                    body={(r) => `${r.owed.toLocaleString()}원`}
                  />
                  <Column
                    header="정산"
                    body={(r) => {
                      if (!detail.payer?.trim())
                        return (
                          <span className="text-color-secondary">
                            결제자 없음
                          </span>
                        );
                      if (r.person === detail.payer)
                        return <Tag severity="info">결제함</Tag>;
                      if (r.owed > 0)
                        return (
                          <span className="text-pink-500">
                            → {detail.payer}에게 {r.owed.toLocaleString()}원
                          </span>
                        );
                      return "—";
                    }}
                  />
                </DataTable>
              </AccordionTab>
            ))}
          </Accordion>
        </div>
      )}
    </Panel>
  );
}
