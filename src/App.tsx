import { Editor } from "./editor/Editor";
import { SidecarFeed } from "./sidecar/SidecarFeed";

export default function App() {
  return (
    <div className="app">
      <main className="editor-panel">
        <Editor />
      </main>
      <SidecarFeed />
    </div>
  );
}
