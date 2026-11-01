
import { useEffect, useRef, useState } from "react"; // useEffect handles lifecycle operations, useState manages UI data, and useRef stores object references.
import "./App.css";
import { Editor } from "@monaco-editor/react"; // Integrates Monaco Editor into React.

import * as Y from "yjs"; // Creates shared documents using CRDT.
import { WebsocketProvider } from "y-websocket"; // Connects Yjs documents to the WebSocket server.
import { MonacoBinding } from "y-monaco"; // Synchronizes Monaco Editor with Yjs shared text.

function App() {
  const roomId = new URLSearchParams(window.location.search).get("room") || "room-1";
  const [message, setMessage] = useState("Connecting...");
  const bindingRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  // Fetch the backend message when the component initially loads.
  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Request failed");
        }
        return response.json();
      })
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Could not connect to FastAPI"));
  }, []);

  // Initialize Yjs and connect Monaco Editor to the collaboration server.
  const handleEditorMount = (editor) => {

    // Create a local Yjs document for collaborative editing.
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Connect to the backend WebSocket server and join room-1.
    const provider = new WebsocketProvider(
      "ws://127.0.0.1:8000/ws",
      roomId,
      ydoc
    );
    providerRef.current = provider;

    // Get the shared text object that stores the source code.
    const ytext = ydoc.getText("monaco");

    // Get Monaco's underlying text model.
    const model = editor.getModel();

    // Bind Monaco Editor with Yjs to synchronize code changes.
    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      provider.awareness
    );
    bindingRef.current = binding;

    // Add initial code only after the shared document has synchronized.
    provider.on("sync", (isSynced) => {
      if (isSynced && ytext.length === 0) {
        ytext.insert(0, "// write your code here");
      }
    });
    // Display WebSocket connection status in the browser console.
    provider.on("status", (event) => {
      console.log("WebSocket status:", event.status);
    });
  };

  // Release resources when Monaco Editor is unmounted.
  const handleEditorUnmount = () => {
    bindingRef.current?.destroy();
    providerRef.current?.destroy();
    ydocRef.current?.destroy();

    bindingRef.current = null;
    providerRef.current = null;
    ydocRef.current = null;
  };

  return (
    <main className="h-screen w-full p-2 bg-black flex gap-2">

      <aside className="h-full w-1/4 bg-amber-100 border">
        <div className="heading">
          <h2 className="font-bold editor-h">Collaborative Editor</h2>
        </div>
        <p className="m-4 p-2">{message}</p>
      </aside>

      <section className="h-full w-3/4 bg-neutral-800 border p-2">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          defaultValue="// write you code here"
          theme="vs-dark"
          onMount={handleEditorMount}
          onUnmount={handleEditorUnmount}
        />
      </section>

    </main>
  );
}

export default App;
