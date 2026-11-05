import { useEffect, useRef, useState } from "react";
import type { Project } from "../model/project";
import type { CommandRequest } from "../commands/document";
export default function CommandPanel({
  getSnapshot,
  onApply,
  onClose,
}: {
  getSnapshot: () => { project: Project; revision: number };
  onApply: (request: unknown) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [snapshot, setSnapshot] = useState(() => getSnapshot()),
    [error, setError] = useState(""),
    [text, setText] = useState(() =>
      JSON.stringify(
        {
          version: 1,
          expectedRevision: getSnapshot().revision,
          commands: [
            {
              type: "create",
              shape: "rectangle",
              x: 120,
              y: 120,
              width: 120,
              height: 80,
              fill: "#eeeeee",
            },
          ],
        } satisfies CommandRequest,
        null,
        2,
      ),
    );
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      className="command-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="command-title"
    >
      <div className="command-title">
        <h2 id="command-title">Automation workbench</h2>
        <button aria-label="Close automation workbench" onClick={onClose}>
          ×
        </button>
      </div>
      <p>
        Local, validated commands. This is the future MCP integration
        boundary—not a connected AI model or network endpoint.
      </p>
      <div className="command-meta">
        Protocol 1 · Revision {snapshot.revision} ·{" "}
        {snapshot.project.parts.length} parts
        <button
          onClick={() => {
            const next = getSnapshot();
            setSnapshot(next);
            setError("");
            setText((old) => {
              try {
                return JSON.stringify(
                  { ...JSON.parse(old), expectedRevision: next.revision },
                  null,
                  2,
                );
              } catch {
                return old;
              }
            });
          }}
        >
          Refresh revision
        </button>
      </div>
      <label>
        Command batch
        <textarea
          aria-label="Command batch"
          spellCheck={false}
          maxLength={128000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <details>
        <summary>Inspect document snapshot</summary>
        <pre>
          {JSON.stringify(
            {
              ...snapshot,
              project: {
                ...snapshot.project,
                source: { name: snapshot.project.source.name, preserved: true },
                assets: snapshot.project.assets?.map((asset) =>
                  asset.kind === "image"
                    ? { ...asset, dataURL: "[binary omitted]" }
                    : asset,
                ),
              },
            },
            null,
            2,
          ).slice(0, 200000)}
        </pre>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="command-footer">
        <button onClick={onClose}>Close</button>
        <button
          className="primary"
          onClick={() => {
            try {
              if (text.length > 128000)
                throw Error("Command batch is too large.");
              onApply(JSON.parse(text));
              const next = getSnapshot();
              setSnapshot(next);
              setError("");
              setText((old) =>
                JSON.stringify(
                  { ...JSON.parse(old), expectedRevision: next.revision },
                  null,
                  2,
                ),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Command rejected.");
            }
          }}
        >
          Apply atomically
        </button>
      </div>
    </dialog>
  );
}
