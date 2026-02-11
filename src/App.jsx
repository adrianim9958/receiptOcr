import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "primereact/button";
import { TabView, TabPanel } from "primereact/tabview";

import Round from "./components/Round";
import ParticipantManager from "./components/ParticipantManager";
import SettlementPanel from "./components/SettlementPanel";
import { computeSettlement } from "./utils/util";

const STORAGE_KEY = "receipt_settle_state_v2";

const VEHICLE_EXPENSE_ITEMS = ["차량비", "주유비", "톨게이트비", "주차비"];

function createDefaultRound(name, items = [], kind = "normal") {
  return {
    id: uuidv4(),
    name,
    kind, // "normal" | "vehicle"
    items,
    imageSrc: "",
    rawText: "",
    evidence: "",
    payer: "",
  };
}

export default function App() {
  const [rounds, setRounds] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);

  const normalizeRounds = (inputRounds) => {
    const withKind = (inputRounds || []).map((r) => {
      // Backward-compat: 기존에 만들어진 "차량이용" 차수 이름을 감지
      const isVehicle = typeof r?.kind === "string"
        ? r.kind === "vehicle"
        : String(r?.name || "").includes("차량이용");
      return {
        ...r,
        kind: isVehicle ? "vehicle" : "normal",
      };
    });

    // 차량이용 탭을 항상 맨 앞으로
    const vehicles = withKind.filter((r) => r.kind === "vehicle");
    const normals = withKind.filter((r) => r.kind !== "vehicle");
    return [...vehicles, ...normals];
  };

  // Load state on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        setRounds(normalizeRounds(saved.rounds || []));
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
    setRounds((prev) => {
      const prevNormalized = normalizeRounds(prev);
      const normalCount = prevNormalized.filter((r) => r.kind !== "vehicle").length;
      const name = nameOverride || `${normalCount + 1}차`;
      return [...prevNormalized, createDefaultRound(name)];
    });
    // 방금 추가한 (일반)차수로 이동: 차량이용 탭이 있으면 index가 +1 밀림
    setActiveRoundIndex(rounds.some((r) => r.kind === "vehicle") ? rounds.length : rounds.length);
  };

  const addVehicleRound = () => {
    setRounds((prev) => {
      const prevNormalized = normalizeRounds(prev);

      const existingIdx = prevNormalized.findIndex((r) => r.kind === "vehicle");
      if (existingIdx >= 0) {
        const existing = prevNormalized[existingIdx];
        const rest = prevNormalized.filter((_, i) => i !== existingIdx);
        return [existing, ...rest];
      }

      const items = VEHICLE_EXPENSE_ITEMS.map((label) => ({
        id: uuidv4(),
        name: label,
        amount: 0,
        assignees: [],
      }));

      const vehicleRound = createDefaultRound("차량이용", items, "vehicle");
      return [vehicleRound, ...prevNormalized];
    });
    // 차량이용 탭은 항상 0번
    setActiveRoundIndex(0);
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
  };

  const clearAll = () => {
    if (!window.confirm("전체 내역(차수·참여자)을 삭제하고 처음부터 시작할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRounds([createDefaultRound("1차")]);
    setParticipants([]);
    setActiveRoundIndex(0);
  };

  // Per-round settlement (single source of truth for settlement data)
  const roundDetails = useMemo(() => {
    return rounds.map((round, idx) => {
      const res = computeSettlement({
        items: round.items,
        participants,
        payer: round.payer,
      });
      return {
        roundName: round.name,
        roundIndex: idx,
        total: res.total,
        payer: round.payer,
        rows: res.rows,
      };
    });
  }, [rounds, participants]);

  // Grand total derived from roundDetails only
  const grandTotal = useMemo(() => {
    const summary = {};
    participants.forEach((p) => {
      summary[p] = { owed: 0, paid: 0 };
    });
    roundDetails.forEach((detail) => {
      detail.rows.forEach((row) => {
        summary[row.person].owed += row.owed;
      });
      if (detail.payer) summary[detail.payer].paid += detail.total;
    });
    return Object.entries(summary).map(([person, data]) => ({
      person,
      paid: data.paid,
      owed: data.owed,
      net: data.paid - data.owed,
    }));
  }, [participants, roundDetails]);


  return (
    <div className="p-3" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="grid justify-content-between align-items-center mb-3">
        <div className="col-12 lg:col-4">
          <h2 className="m-0">영수증 정산 (N차)</h2>
        </div>
        <div className="col-12 lg:col-8 flex gap-2 justify-content-end">
          <Button label="차수 추가" icon="pi pi-plus" onClick={() => addRound()}
            severity="info" size="small" />
          <Button label="차량이용" icon="pi pi-car" onClick={addVehicleRound}
            severity="help" size="small" />
          <Button label="전체 내역 삭제" icon="pi pi-trash" onClick={() => clearAll()}
            severity="danger" size="small" outlined />
        </div>
      </div>

      <div className="grid">
        <div
          className="col-12 lg:col-4"
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 7rem)",
            minHeight: 0,
          }}
        >
          <ParticipantManager
            participants={participants}
            onAdd={addParticipant}
            onRemove={removeParticipant}
          />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <SettlementPanel
              rounds={rounds}
              grandTotal={grandTotal}
              roundDetails={roundDetails}
            />
          </div>
        </div>

        <div className="col-12 lg:col-8">
          {rounds.length === 0 ? (
            <div className="p-4 text-center text-color-secondary">
              차수를 불러오는 중…
            </div>
          ) : (
            <TabView
              activeIndex={Math.min(activeRoundIndex, rounds.length - 1)}
              onTabChange={(e) => setActiveRoundIndex(e.index)}
            >
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
          )}
        </div>
      </div>
    </div>
  );
}