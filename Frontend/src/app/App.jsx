
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Editor } from "@monaco-editor/react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import {
  Code2,
  Users,
  Zap,
  Link2,
  PlusSquare,
  LogIn,
  Copy,
  ArrowLeft,
  Check,
  Circle,
  Terminal,
  FileCode2,
  Trash2,
  Shapes,
} from "lucide-react";

function App() {
  const roomId = new URLSearchParams(window.location.search).get("room");

  const [roomValid, setRoomValid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [yjsReady, setYjsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("editor");

  const [files, setFiles] = useState([]);

  const [activeFileId, setActiveFileId] = useState("main-file");
  const [showFileInput, setShowFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const bindingRef = useRef(null);
  const modelsRef = useRef(new Map());
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  const activeFile = files.find((file) => file.id === activeFileId);

  const handleCreateFile = () => {
    const name = newFileName.trim();

    if (!name) {
      setActionError("Please enter a file name.");
      return;
    }

    if (/[\\/:*?"<>|]/.test(name)) {
      setActionError("The file name contains invalid characters.");
      return;
    }

    const sharedFiles = ydocRef.current?.getMap("files");
    if (!sharedFiles) {
      setActionError("The room is not connected yet. Please try again.");
      return;
    }

    const duplicateName = Array.from(sharedFiles.values()).some(
      (file) => file.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      setActionError("A file with this name already exists.");
      return;
    }

    const extension = name.includes(".")
      ? name.split(".").pop().toLowerCase()
      : "";

    const languageMap = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      java: "java",
      html: "html",
      css: "css",
      json: "json",
      md: "markdown",
      cpp: "cpp",
      c: "c",
    };

    const newFile = {
      id: crypto.randomUUID(),
      name,
      language: languageMap[extension] || "plaintext",
      content: "",
    };

    sharedFiles.set(newFile.id, {
      id: newFile.id,
      name: newFile.name,
      language: newFile.language,
    });
    setActiveFileId(newFile.id);
    setNewFileName("");
    setShowFileInput(false);
    setActionError("");
  };

  const handleDeleteFile = (fileId) => {
    const yfiles = ydocRef.current?.getMap("files");

    if (!yfiles || yfiles.size <= 1) return;

    const currentFiles = Array.from(yfiles.values());
    const fileIndex = currentFiles.findIndex((file) => file.id === fileId);

    if (fileIndex === -1) return;

    yfiles.delete(fileId);

    if (activeFileId === fileId) {
      const remainingFiles = Array.from(yfiles.values());
      const nextActiveIndex = Math.max(0, fileIndex - 1);
      setActiveFileId(remainingFiles[nextActiveIndex].id);
    }
  };

  const handleCreateRoom = async () => {
    try {
      setCreatingRoom(true);
      setActionError("");

      const response = await fetch("http://127.0.0.1:8000/rooms/", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to create room");
      }

      const data = await response.json();

      window.location.href = `/?room=${data.room_id}`;
    } catch (error) {
      setActionError(error.message || "Something went wrong");
      setCreatingRoom(false);
    }
  };

  const handleJoinRoom = (event) => {
    event.preventDefault();

    const id = joinRoomId.trim();

    if (!id) {
      setActionError("Please enter a room ID.");
      return;
    }

    setActionError("");
    window.location.href = `/?room=${encodeURIComponent(id)}`;
  };

  const handleBackHome = () => {
    window.location.href = "/";
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setActionError("");

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setActionError("Unable to copy room ID. Please copy it manually.");
    }
  };

  useEffect(() => {
    if (!roomId) {
      setRoomValid(false);
      setIsValidating(false);
      return;
    }

    const controller = new AbortController();

    const validateRoom = async () => {
      try {
        setIsValidating(true);

        const response = await fetch(
          `http://127.0.0.1:8000/rooms/${encodeURIComponent(roomId)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Room not found");
        }

        setRoomValid(true);
        setActionError("");
      } catch (error) {
        if (error.name !== "AbortError") {
          setRoomValid(false);
          setActionError("Room not found. Please check the room ID.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsValidating(false);
        }
      }
    };

    validateRoom();

    return () => controller.abort();
  }, [roomId]);

  const handleEditorMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setEditorReady(true);
  };

  useEffect(() => {
    if (!roomValid || !editorReady || !roomId) {
      return;
    }

    const ydoc = new Y.Doc();

    const provider = new WebsocketProvider(
      "ws://127.0.0.1:8000/ws",
      roomId,
      ydoc
    );

    const yfiles = ydoc.getMap("files");
    const legacyText = ydoc.getText("monaco");

    ydocRef.current = ydoc;
    providerRef.current = provider;

    const syncFiles = () => {
      const sharedFiles = Array.from(yfiles.values());

      setFiles(sharedFiles);

      setActiveFileId((currentActiveId) => {
        const stillExists = sharedFiles.some(
          (file) => file.id === currentActiveId
        );

        return stillExists
          ? currentActiveId
          : sharedFiles[0]?.id || "";
      });
    };

    yfiles.observe(syncFiles);

    const handleSync = (isSynced) => {
      if (!isSynced) return;

      if (yfiles.size === 0) {
        yfiles.set("main-file", {
          id: "main-file",
          name: "main.js",
          language: "javascript",
        });
      }

      const mainText = ydoc.getText("file:main-file");

      if (mainText.length === 0) {
        if (legacyText.length > 0) {
          mainText.insert(0, legacyText.toString());
        } else {
          mainText.insert(0, "// Start writing your code here");
        }
      }

      syncFiles();
      setYjsReady(true);
    };

    const handleStatus = ({ status }) => {
      setConnectionStatus(
        status === "connected" ? "Connected" : "Disconnected"
      );
    };

    provider.on("sync", handleSync);
    provider.on("status", handleStatus);

    return () => {
      provider.off("sync", handleSync);
      provider.off("status", handleStatus);
      yfiles.unobserve(syncFiles);

      bindingRef.current?.destroy();
      bindingRef.current = null;

      modelsRef.current.forEach((model) => model.dispose());
      modelsRef.current.clear();

      provider.destroy();
      ydoc.destroy();

      setYjsReady(false);
      ydocRef.current = null;
      providerRef.current = null;
    };
  }, [roomValid, editorReady, roomId]);

  useEffect(() => {
    if (
      !yjsReady ||
      !activeFileId ||
      !editorRef.current ||
      !ydocRef.current ||
      !monacoRef.current
    ) {
      return;
    }

    const file = files.find((item) => item.id === activeFileId);
    if (!file) return;

    const editor = editorRef.current;
    const ydoc = ydocRef.current;
    const provider = providerRef.current;
    const ytext = ydoc.getText(`file:${file.id}`);

    bindingRef.current?.destroy();
    bindingRef.current = null;

    let model = modelsRef.current.get(file.id);

    if (!model || model.isDisposed()) {
      model = monacoRef.current.editor.createModel(
        ytext.toString(),
        file.language || "plaintext",
        monacoRef.current.Uri.parse(
          `inmemory://co-lab/${encodeURIComponent(file.id)}`
        )
      );
      modelsRef.current.set(file.id, model);
    } else {
      monacoRef.current.editor.setModelLanguage(
        model,
        file.language || "plaintext"
      );
    }

    editor.setModel(model);

    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      provider.awareness
    );

    bindingRef.current = binding;

    return () => {
      binding.destroy();
      if (bindingRef.current === binding) {
        bindingRef.current = null;
      }
    };
  }, [yjsReady, activeFileId, files]);

  if (!roomId) {
    return (
      <main className="min-h-screen bg-[#F2F0EA] px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="flex items-center justify-between border-b-2 border-[#222222] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-[#222222] bg-[#222222] text-white">
                <Code2 size={20} />
              </div>

              <span className="text-xl font-bold tracking-tight text-[#222222]">
                co.lab
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border-2 border-[#222222] bg-white px-3 py-2 text-sm font-semibold text-[#222222] transition hover:bg-[#E8E6DF]"
              >
                Login
              </button>

              <button
                type="button"
                className="rounded-md border-2 border-[#222222] bg-[#222222] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#444444]"
              >
                Sign up
              </button>
            </div>
          </header>

          <div className="space-y-6 py-6">
            <section className="rounded-lg border-2 border-[#222222] bg-white p-5 shadow-[4px_4px_0_#222222] sm:p-6">
              <span className="inline-block rounded-full bg-[#F0F0F0] px-3 py-1.5 text-xs font-semibold tracking-wide text-[#222222]">
                REAL-TIME COLLABORATION
              </span>

              <div className="mt-4 space-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-[#252525] sm:text-4xl">
                  Think together.
                </h1>

                <h2 className="text-3xl font-bold tracking-tight text-[#7A7A7A] sm:text-4xl">
                  Code together.
                </h2>
              </div>

              <p className="mt-4 max-w-5xl text-sm leading-relaxed text-[#777777] sm:text-base">
                A collaborative coding workspace built for developers who
                want to create, experiment and solve problems together
                — in real time.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FeatureCard
                  icon={<Users size={24} />}
                  title="Live collaboration"
                  description="Work together in one editor."
                />

                <FeatureCard
                  icon={<Zap size={24} />}
                  title="Instant sync"
                  description="Changes appear in real time."
                />

                <FeatureCard
                  icon={<Code2 size={24} />}
                  title="Developer focused"
                  description="A familiar coding environment."
                />

                <FeatureCard
                  icon={<Link2 size={24} />}
                  title="Easy room sharing"
                  description="Invite others using a room ID."
                />
              </div>
            </section>

            <section className="border-t border-[#B8B5AD] pt-6">
              <h2 className="text-2xl font-bold tracking-tight text-[#252525]">
                Ready to collaborate?
              </h2>

              <p className="mt-2 text-sm text-[#777777] sm:text-base">
                Create a new workspace or join your team's existing session.
              </p>

              <div className="mt-4 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border-2 border-[#222222] bg-white p-4 shadow-[3px_3px_0_#222222] sm:p-5">
                  <span className="text-2xl font-semibold text-[#252525]">
                    01
                  </span>

                  <PlusSquare size={28} className="text-[#252525]" />

                  <h3 className="text-xl font-semibold text-[#151515]">
                    Create a room
                  </h3>

                  <p className="text-sm leading-relaxed text-[#777777]">
                    Start a fresh coding session and invite collaborators.
                  </p>

                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    disabled={creatingRoom}
                    className="mt-1 w-full rounded-md border-2 border-[#222222] bg-[#222222] px-4 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingRoom ? "Creating room..." : "Create room"}
                  </button>
                </div>

                <form
                  onSubmit={handleJoinRoom}
                  className="flex flex-col gap-2 rounded-lg border-2 border-[#222222] bg-[#E8E6DF] p-4 shadow-[3px_3px_0_#222222] sm:p-5"
                >
                  <span className="text-2xl font-semibold text-[#252525]">
                    02
                  </span>

                  <LogIn size={28} className="text-[#252525]" />

                  <h3 className="text-xl font-semibold text-[#151515]">
                    Join a room
                  </h3>

                  <p className="text-sm leading-relaxed text-[#777777]">
                    Already have a room ID? Enter it to join.
                  </p>

                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(event) => {
                      setJoinRoomId(event.target.value);
                      setActionError("");
                    }}
                    placeholder="Enter room ID..."
                    className="w-full rounded-md border-2 border-[#222222] bg-white px-3 py-3 text-sm text-[#252525] outline-none transition focus:ring-2 focus:ring-[#777777]"
                  />

                  <button
                    type="submit"
                    className="w-full rounded-md border-2 border-[#222222] bg-[#222222] px-4 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#444444]"
                  >
                    Join room
                  </button>
                </form>
              </div>

              {actionError && (
                <p className="mt-3 rounded-md border-2 border-[#222222] bg-white px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              )}
            </section>
          </div>

          <footer className="flex flex-col justify-between gap-2 border-t border-[#B8B5AD] py-4 text-sm text-[#666666] sm:flex-row sm:items-center">
            <p>© 2026 co.lab</p>
            <p>Built for collaborative coding.</p>
          </footer>
        </div>
      </main>
    );
  }

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F0EA]">
        <p className="text-base font-medium text-[#252525]">
          Validating room...
        </p>
      </div>
    );
  }

  if (!roomValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F0EA] px-4">
        <div className="w-full max-w-md rounded-lg border-2 border-[#222222] bg-white p-6 shadow-[4px_4px_0_#222222]">
          <h2 className="text-xl font-bold text-[#252525]">
            Room not found
          </h2>

          <p className="mt-2 text-sm text-[#777777]">
            {actionError || "This room does not exist or is no longer available."}
          </p>

          <button
            onClick={handleBackHome}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#222222] bg-[#222222] px-4 py-3 text-sm font-semibold text-white"
          >
            <ArrowLeft size={17} />
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F2F0EA] p-3 sm:p-4">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-[#222222] bg-white p-3 shadow-[3px_3px_0_#222222]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackHome}
              className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-[#222222] bg-[#222222] text-white hover:bg-[#444444]"
              aria-label="Back to home"
            >
              <ArrowLeft size={17} />
            </button>

            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#222222] text-white">
              <Code2 size={20} />
            </div>

            <div>
              <h1 className="text-lg font-bold text-[#252525]">co.lab</h1>
              <p className="text-xs text-[#777777]">Collaborative workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border-2 border-[#222222] bg-[#F2F0EA] px-3 py-2 text-xs font-medium text-[#252525]">
              Room: {roomId}
            </div>

            <div className="flex items-center gap-2 rounded-md border-2 border-[#222222] bg-white px-3 py-2 text-xs">
              <Circle
                size={9}
                fill={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
                color={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
              />
              {connectionStatus}
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 rounded-md border-2 border-[#222222] bg-white px-3 py-2 text-xs font-semibold text-[#252525] hover:bg-[#F2F0EA]"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied!" : "Copy Room ID"}
            </button>
          </div>
        </header>

        <section className="flex h-[calc(100vh-115px)] min-h-[500px] overflow-hidden rounded-lg border-2 border-[#222222] bg-[#1E1E1E] shadow-[4px_4px_0_#222222]">
          <aside className="hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-[#444444] bg-[#252526] text-white md:flex">
            <div className="border-b border-[#444444] px-4 py-3">
              <span className="text-xs font-semibold tracking-wider text-gray-400">
                EXPLORER
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-gray-300">
                  PROJECT FILES
                </span>

                <button
                  onClick={() => {
                    setShowFileInput(true);
                    setActionError("");
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-[#37373D] hover:text-white"
                  title="Create file"
                >
                  <PlusSquare size={16} />
                </button>
              </div>

              {showFileInput && (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateFile();
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={newFileName}
                    onChange={(event) => {
                      setNewFileName(event.target.value);
                      setActionError("");
                    }}
                    placeholder="example.js"
                    className="w-full rounded border border-[#555555] bg-[#1E1E1E] px-2 py-2 text-xs text-white outline-none focus:border-blue-400"
                  />

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      Create
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowFileInput(false);
                        setNewFileName("");
                        setActionError("");
                      }}
                      className="flex-1 rounded bg-[#37373D] px-2 py-1.5 text-xs text-gray-300 hover:bg-[#45454D]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 [scrollbar-color:#666666_#252526] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#666666] [&::-webkit-scrollbar-track]:bg-[#252526]">
                {files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${
                      activeFileId === file.id
                        ? "border border-[#555555] bg-[#37373D] text-white"
                        : "text-gray-400 hover:bg-[#303036] hover:text-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileCode2 size={15} className="shrink-0 text-blue-400" />
                      <span className="truncate">{file.name}</span>
                    </div>

                    {files.length > 1 && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteFile(file.id);
                        }}
                        className="hidden rounded p-1 text-gray-400 hover:bg-[#4A3030] hover:text-red-400 group-hover:block"
                        title="Delete file"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-[#444444] px-3 py-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-300">
                <Users size={15} />
                <span>PARTICIPANTS</span>
              </div>

              <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-400">
                <Circle size={8} fill="#16A34A" color="#16A34A" />
                You
              </div>

              <p className="mt-2 px-2 text-xs text-gray-500">
                Collaborators will appear here.
              </p>
            </div>

            <div className="mt-auto shrink-0 border-t border-[#444444] px-4 py-3 text-xs text-gray-500">
              co.lab workspace
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-[#444444] bg-[#292929] px-3">
              <div className="flex items-center gap-1 py-2">
                <button
                  onClick={() => setActiveWorkspace("editor")}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    activeWorkspace === "editor"
                      ? "bg-[#3A3A3A] text-white"
                      : "text-gray-400 hover:bg-[#333333] hover:text-white"
                  }`}
                >
                  <Code2 size={15} />
                  Code Editor
                </button>

                <button
                  onClick={() => setActiveWorkspace("whiteboard")}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    activeWorkspace === "whiteboard"
                      ? "bg-[#F2F0EA] text-[#252525]"
                      : "text-gray-400 hover:bg-[#333333] hover:text-white"
                  }`}
                >
                  <Shapes size={15} />
                  Whiteboard
                </button>
              </div>

              {activeWorkspace === "editor" ? (
                <div className="flex items-center gap-2 pr-2 text-xs text-gray-400">
                  <FileCode2 size={15} className="text-blue-400" />
                  <span>{activeFile?.name || "main.js"}</span>
                  <span className="text-gray-600">·</span>
                  <Terminal size={14} />
                  {activeFile?.language || "JavaScript"}
                </div>
              ) : (
                <span className="pr-2 text-xs text-gray-400">
                  Shared room canvas
                </span>
              )}
            </div>

            {activeWorkspace === "editor" ? (
              <>
                <div className="min-h-0 flex-1">
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    defaultValue=""
                    theme="vs-dark"
                    onMount={handleEditorMount}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 14,
                      fontFamily: "Consolas, monospace",
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 16 },
                      readOnly: false,
                      cursorBlinking: "smooth",
                      smoothScrolling: true,
                    }}
                  />
                </div>

                <div className="flex shrink-0 items-center justify-between border-t border-[#444444] bg-[#252526] px-4 py-2 text-xs text-gray-400">
                  <span>{activeFile?.language || "JavaScript"}</span>
                  <span>UTF-8 · LF</span>
                </div>
              </>
            ) : (
              <div className="min-h-0 flex-1 bg-white">
                <Tldraw />
              </div>
            )}
          </div>
        </section>

        <footer className="mt-4 flex items-center justify-between text-xs text-[#777777]">
          <span>co.lab · Collaborative coding</span>
          <span>Room {roomId}</span>
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="rounded-md border-2 border-[#222222] bg-[#F0F0EF] p-3 transition duration-200 hover:-translate-y-1 hover:shadow-[3px_3px_0_#222222]">
      <div className="mb-2 text-[#374151]">{icon}</div>

      <h3 className="text-base font-semibold text-[#151515]">
        {title}
      </h3>

      <p className="mt-1 text-sm text-[#777777]">
        {description}
      </p>
    </div>
  );
}

export default App;
