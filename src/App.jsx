import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Panel } from "primereact/panel";
import { Message } from "primereact/message";
import { TabView, TabPanel } from "primereact/tabview";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";

import Round from "./Round";
import { computeSettlement } from "./utils/util";

const STORAGE_KEY = "receipt_settle_state_v2"; // Changed to v2 for structure change

export default function App() {
  const [rounds, setRounds] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);

  // Load state on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        setRounds(saved.rounds || []);
        setParticipants(saved.participants || []);
      } else {
        // Init with 1 round
        addRound("1차");
      }
    } catch {
      addRound("1차");
    }
  }, []);

  // Save state
  useEffect(() => {
    if (rounds.length === 0 && participants.length === 0) return; // Skip initial empty save if default
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rounds, participants }));
  }, [rounds, participants]);

  const addRound = (nameOverride) => {
    const name = nameOverride || `${rounds.length + 1}차`;
    setRounds(prev => {
      const newRounds = [
        ...prev,
        {
          id: uuidv4(),
          name,
          items: [],
          imageSrc: "",
          rawText: "",
          evidence: "",
          payer: ""
        }
      ];
      // Set active index to the new round
      // We need to do this in next render or trust the length
      setActiveRoundIndex(newRounds.length - 1);
      return newRounds;
    });
  };

  const removeRound = (index) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      setRounds(prev => prev.filter((_, i) => i !== index));
      if (activeRoundIndex >= index && activeRoundIndex > 0) {
        setActiveRoundIndex(activeRoundIndex - 1);
      }
    }
  };

  const updateRound = (index, newData) => {
    setRounds(prev => prev.map((r, i) => i === index ? newData : r));
  };

  const addParticipant = (name) => {
    const n = (name || "").trim();
    if (!n || participants.includes(n)) return;
    setParticipants([...participants, n]);
  };

  const removeParticipant = (name) => {
    setParticipants(participants.filter(p => p !== name));
    // Also remove from all rounds assignments if needed? 
    // For now let's keep it simple, cleaner to remove from rounds too but maybe complex.
  };

  // Grand Total Calculation
  const grandTotal = useMemo(() => {
    const summary = {}; // { person: { owed, paid, final } }

    // Init summary
    participants.forEach(p => {
      summary[p] = { owed: 0, paid: 0, final: 0 };
    });

    rounds.forEach(round => {
      const res = computeSettlement({
        items: round.items,
        participants,
        payer: round.payer
      });

      // Accumulate owed
      res.rows.forEach(row => {
        if (!summary[row.person]) summary[row.person] = { owed: 0, paid: 0, final: 0 };
        summary[row.person].owed += row.owed;
      });

      // Accumulate paid (payer paid the total for this round)
      if (round.payer) {
        if (!summary[round.payer]) summary[round.payer] = { owed: 0, paid: 0, final: 0 };
        summary[round.payer].paid += res.total;
      }
    });

    // Calc final transfer (positive = receive, negative = send)
    // Actually our `computeSettlement` returns "payToPayer". 
    // Here we want a global netting.

    return Object.entries(summary).map(([person, data]) => ({
      person,
      paid: data.paid,
      owed: data.owed,
      net: data.paid - data.owed
    }));

  }, [rounds, participants]);


  return (
    <div className="p-3" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="flex justify-content-between align-items-center mb-3">
        <h2 className="m-0">영수증 정산 (N차)</h2>
        <div className="flex gap-2">
          <Button label="차수 추가" icon="pi pi-plus" onClick={() => addRound()} />
        </div>
      </div>

      <div className="grid">
        <div className="col-12 lg:col-3">
          <Panel header="참여자 관리" className="mb-3">
            <ParticipantAdder onAdd={addParticipant} />
            <div className="flex gap-2 flex-wrap mt-2">
              {participants.map(p => (
                <div key={p} className="p-tag p-tag-rounded flex align-items-center">
                  {p}
                  <i className="pi pi-times ml-2 cursor-pointer"
                    style={{ color: 'red', fontSize: '0.7rem' }}
                    onClick={() => removeParticipant(p)} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel header="최종 정산 (모든 차수 합산)" className="mb-3">
            <DataTable value={grandTotal} size="small" stripedRows>
              <Column field="person" header="이름" />
              <Column field="net" header="정산금" body={(r) => {
                const val = r.net;
                const color = val >= 0 ? 'text-primary' : 'text-pink-500';
                const text = val >= 0 ? `받을 돈 ${val.toLocaleString()}` : `보낼 돈 ${Math.abs(val).toLocaleString()}`;
                return <span className={`font-bold ${color}`}>{text}</span>
              }} />
            </DataTable>
          </Panel>
        </div>

        <div className="col-12 lg:col-9">
          <TabView activeIndex={activeRoundIndex} onTabChange={(e) => setActiveRoundIndex(e.index)}>
            {rounds.map((round, idx) => (
              <TabPanel key={round.id} header={round.name}>
                <Round
                  data={round}
                  participants={participants}
                  onUpdate={(newData) => updateRound(idx, newData)}
                  onDelete={() => removeRound(idx)}
                />
              </TabPanel>
            ))}
          </TabView>
        </div>
      </div>
    </div>
  );
}

function ParticipantAdder({ onAdd }) {
  const [name, setName] = useState("");

  return (
    <div className="flex gap-2">
      <InputText
        value={name}
        maxLength={3}
        onChange={(e) => setName(e.target.value.slice(0, 3))}
        placeholder="이름(최대 3글자)"
        className="w-full"
        onKeyDown={(e) => {
          if (e.nativeEvent?.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            const v = name.trim();
            if (!v) return;
            onAdd(v);
            setName("");
          }
        }}
      />
      <Button
        icon="pi pi-plus"
        onClick={() => {
          const v = name.trim();
          if (!v) return;
          onAdd(v);
          setName("");
        }}
      />
    </div>
  );
}