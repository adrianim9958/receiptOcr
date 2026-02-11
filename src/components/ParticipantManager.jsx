import { useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Panel } from "primereact/panel";
import { Tag } from "primereact/tag";

function ParticipantAdder({ onAdd }) {
  const [name, setName] = useState("");

  const handleSubmit = () => {
    const v = name.trim();
    if (!v) return;
    onAdd(v);
    setName("");
  };

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
            handleSubmit();
          }
        }}
      />
      <Button icon="pi pi-plus" onClick={handleSubmit} />
    </div>
  );
}

export default function ParticipantManager({ participants, onAdd, onRemove }) {
  return (
    <Panel header="참여자 관리" className="mb-3">
      <ParticipantAdder onAdd={onAdd} />
      <div className="flex gap-2 flex-wrap mt-2">
        {participants.map((p) => (
          <Tag
            key={p}
            className="p-tag p-tag-rounded flex align-items-center"
            severity="warning"
          >
            {p}
            <i
              className="pi pi-times ml-2 cursor-pointer"
              style={{ color: "white", fontSize: "0.7rem" }}
              onClick={() => onRemove(p)}
            />
          </Tag>
        ))}
      </div>
    </Panel>
  );
}
