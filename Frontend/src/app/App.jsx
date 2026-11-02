
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
  PlusSquare,
  Copy,
  ArrowLeft,
  Check,
  Circle,
  FileCode2,
  Trash2,
  Shapes,
  Plus,
} from "lucide-react";

function destroyMonacoBinding(bindingRef) {
  const binding = bindingRef.current;
  if (!binding) return;

  bindingRef.current = null;
  binding.destroy();
}

function SyncedWhiteboard({ ydoc }) {
  const cleanupRef = useRef(null);

  const handleMount = (editor) => {
    cleanupRef.current?.();

    

    const sharedRecords = ydoc.getMap("whiteboard");
    const isDocumentRecord = (record) =>
      record.typeName !== "instance" &&
      record.typeName !== "instance_page_state" &&
      record.typeName !== "camera";

    const applyRemoteRecords = (records) => {
      editor.store.mergeRemoteChanges(() => {
        const toPut = [];
        const toRemove = [];

        records.forEach((change, id) => {
          if (change.action === "delete") {
            toRemove.push(id);
          } else if (change.value) {
            toPut.push(change.value);
          }
        });

        if (toRemove.length) editor.store.remove(toRemove);
        if (toPut.length) editor.store.put(toPut);
      });
    };

    // Load existing shared canvas records, or seed a new room's canvas.
    if (sharedRecords.size > 0) {
      const initialRecords = new Map(
        Array.from(sharedRecords.entries()).map(([id, value]) => [
          id,
          { action: "put", value },
        ])
      );
      applyRemoteRecords(initialRecords);
    } else {
      const initialRecords = editor.store
        .allRecords()
        .filter(isDocumentRecord);

      ydoc.transact(() => {
        initialRecords.forEach((record) => {
          sharedRecords.set(record.id, record);
        });
      });
    }

    const handleSharedRecords = (event, transaction) => {
      if (transaction.local) return;

      const changes = new Map();

      for (const [id, change] of event.changes.keys) {
        const isDeleted = change.action === "delete";

        changes.set(id, {
          action: isDeleted ? "delete" : "put",
          value: isDeleted ? null : sharedRecords.get(id),
        });
      }

      applyRemoteRecords(changes);
    };

    sharedRecords.observe(handleSharedRecords);

    const stopListening = editor.store.listen(
      ({ changes }) => {
        ydoc.transact(() => {
          Object.entries(changes.added).forEach(([id, record]) => {
            if (isDocumentRecord(record)) sharedRecords.set(id, record);
          });

          Object.entries(changes.updated).forEach(([id, pair]) => {
            const record = pair[1];
            if (isDocumentRecord(record)) sharedRecords.set(id, record);
          });

          Object.keys(changes.removed).forEach((id) => {
            sharedRecords.delete(id);
          });
        });
      },
      { scope: "document", source: "user" }
    );

    cleanupRef.current = () => {
      stopListening();
      sharedRecords.unobserve(handleSharedRecords);
    };
  };

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  return <Tldraw onMount={handleMount} />;
}



const SAVED_ROOMS_KEY = "colab.savedRooms.v1";

function readSavedRooms() {
  try {
    const rooms = JSON.parse(localStorage.getItem(SAVED_ROOMS_KEY) || "[]");
    return Array.isArray(rooms) ? rooms : [];
  } catch {
    return [];
  }
}

function writeSavedRooms(rooms) {
  localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
}

function App() {
  const roomId = new URLSearchParams(window.location.search).get("room");

  const [roomValid, setRoomValid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [yjsReady, setYjsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [savedRooms, setSavedRooms] = useState(() => readSavedRooms());
  const [roomActionLoading, setRoomActionLoading] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);
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

  const saveRoomList = (nextRooms) => {
    setSavedRooms(nextRooms);
    writeSavedRooms(nextRooms);
  };

  const handleCreateRoom = async (event) => {
    event?.preventDefault();

    const roomName = newRoomName.trim();
    if (!roomName) {
      setActionError("Give this room a name first.");
      return;
    }

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
      const now = new Date().toISOString();
      const room = {
        roomId: data.room_id,
        name: roomName,
        role: "created",
        createdAt: now,
        lastOpenedAt: now,
      };

      saveRoomList([
        room,
        ...savedRooms.filter((item) => item.roomId !== room.roomId),
      ]);

      window.location.href = `/?room=${encodeURIComponent(data.room_id)}`;
    } catch (error) {
      setActionError(error.message || "Something went wrong");
      setCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (event) => {
    event.preventDefault();

    const id = joinRoomId.trim();
    if (!id) {
      setActionError("Please enter a room ID.");
      return;
    }

    try {
      setJoiningRoom(true);
      setActionError("");

      const response = await fetch(
        `http://127.0.0.1:8000/rooms/${encodeURIComponent(id)}`
      );

      if (!response.ok) {
        throw new Error("Room not found. Check the room ID and try again.");
      }

      await response.json();
      const existingRoom = savedRooms.find((room) => room.roomId === id);
      const now = new Date().toISOString();
      const roomEntry = existingRoom
        ? { ...existingRoom, lastOpenedAt: now }
        : {
            roomId: id,
            name: `Room ${id.slice(0, 6)}`,
            role: "joined",
            createdAt: now,
            lastOpenedAt: now,
          };

      saveRoomList([
        roomEntry,
        ...savedRooms.filter((room) => room.roomId !== id),
      ]);

      window.location.href = `/?room=${encodeURIComponent(id)}`;
    } catch (error) {
      setActionError(error.message || "Unable to join this room.");
      setJoiningRoom(false);
    }
  };

  const handleOpenSavedRoom = (room) => {
    const now = new Date().toISOString();
    saveRoomList(
      savedRooms.map((item) =>
        item.roomId === room.roomId
          ? { ...item, lastOpenedAt: now }
          : item
      )
    );
    window.location.href = `/?room=${encodeURIComponent(room.roomId)}`;
  };


  const handleDeleteSavedRoom = async (room) => {
    const confirmed = window.confirm(
      `Delete "${room.name}" from the server? This makes the room unavailable to everyone.`
    );
    if (!confirmed) return;

    setRoomActionLoading(room.roomId);
    setActionError("");

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/rooms/${encodeURIComponent(room.roomId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "The server could not delete this room.");
      }

      saveRoomList(
        savedRooms.filter((item) => item.roomId !== room.roomId)
      );
    } catch (error) {
      setActionError(error.message || "Unable to delete this room.");
    } finally {
      setRoomActionLoading("");
    }
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

      destroyMonacoBinding(bindingRef);

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

    const editor = editorRef.current;
    const ydoc = ydocRef.current;
    const provider = providerRef.current;
    const file = ydoc.getMap("files").get(activeFileId);

    if (!file) return;

    const ytext = ydoc.getText(`file:${activeFileId}`);

    destroyMonacoBinding(bindingRef);

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
      if (bindingRef.current === binding) {
        bindingRef.current = null;
        binding.destroy();
      }
    };
  }, [yjsReady, activeFileId, roomId]);

  if (!roomId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <header className="flex items-center justify-between border-b border-slate-200 pb-4">
            <a href="/" className="flex items-center gap-2 font-semibold">
              <Code2 size={22} />
              <span className="text-xl">co.lab</span>
            </a>
            <span className="text-sm text-slate-500">Collaborative workspace</span>
          </header>

          <section className="py-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              Workspace
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Create a room or join an existing one using its ID.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <form
                onSubmit={handleCreateRoom}
                className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <h2 className="font-medium">Create a room</h2>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(event) => {
                    setNewRoomName(event.target.value);
                    setActionError("");
                  }}
                  maxLength={48}
                  placeholder="Room name"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="submit"
                  disabled={creatingRoom}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={16} />
                  {creatingRoom ? "Creating..." : "Create room"}
                </button>
              </form>

              <form
                onSubmit={handleJoinRoom}
                className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <h2 className="font-medium">Join a room</h2>
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(event) => {
                    setJoinRoomId(event.target.value);
                    setActionError("");
                  }}
                  placeholder="Enter room ID"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="submit"
                  disabled={joiningRoom}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joiningRoom ? "Joining..." : "Join room"}
                </button>
              </form>
            </div>

            {actionError && (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </p>
            )}
          </section>

          <section id="your-rooms" className="border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Saved rooms</h2>
              <span className="text-sm text-slate-500">
                {savedRooms.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This list is stored in this browser.
            </p>

            {savedRooms.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No saved rooms. Create or join a room to get started.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {savedRooms.map((room) => (
                  <div
                    key={room.roomId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{room.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">
                        {room.roomId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSavedRoom(room)}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedRoom(room)}
                        disabled={roomActionLoading === room.roomId}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {roomActionLoading === room.roomId ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Validating room...
      </div>
    );
  }

  if (!roomValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Room not found</h2>
          <p className="mt-2 text-sm text-slate-600">
            {actionError || "This room does not exist or is no longer available."}
          </p>
          <button
            onClick={handleBackHome}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Back to rooms
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-slate-100 p-2 text-slate-900 sm:p-3">
      <header className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackHome}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Back to rooms"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="flex items-center gap-2 font-semibold">
            <Code2 size={20} />
            co.lab
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-slate-100 px-3 py-2 font-mono">
            {roomId}
          </span>
          <span className="flex items-center gap-2 rounded-md px-2 py-2 text-slate-600">
            <Circle
              size={8}
              fill={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
              color={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
            />
            {connectionStatus}
          </span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 hover:bg-slate-50"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-white">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
            <span className="text-xs font-semibold text-slate-600">FILES</span>
            <button
              onClick={() => {
                setShowFileInput(true);
                setActionError("");
              }}
              className="rounded p-1 text-slate-600 hover:bg-slate-200"
              title="Create file"
            >
              <PlusSquare size={16} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-2">
            {showFileInput && (
              <form
                className="mb-2 space-y-2"
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
                  placeholder="File name, e.g. main.py"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-slate-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
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
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm ${
                    activeFileId === file.id
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileCode2 size={15} className="shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  {files.length > 1 && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteFile(file.id);
                      }}
                      className="hidden rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700 group-hover:block"
                      title="Delete file"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-2">
            <div className="flex items-center gap-1 py-1">
              <button
                onClick={() => setActiveWorkspace("editor")}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
                  activeWorkspace === "editor"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Code2 size={14} />
                Editor
              </button>
              <button
                onClick={() => setActiveWorkspace("whiteboard")}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
                  activeWorkspace === "whiteboard"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Shapes size={14} />
                Whiteboard
              </button>
            </div>

            <span className="truncate px-2 text-xs text-slate-500">
              {activeWorkspace === "editor"
                ? `${activeFile?.name || "main.js"} · ${activeFile?.language || "JavaScript"}`
                : "Shared canvas"}
            </span>
          </div>

          <div
            className={`min-h-0 flex-1 flex-col ${
              activeWorkspace === "editor" ? "flex" : "hidden"
            }`}
          >
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                defaultValue=""
                theme="vs-dark"
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "Consolas, monospace",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 12 },
                  readOnly: false,
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                }}
              />
            </div>
            <div className="flex shrink-0 justify-between border-t border-slate-700 bg-[#1E1E1E] px-3 py-1.5 text-xs text-slate-400">
              <span>{activeFile?.language || "JavaScript"}</span>
              <span>UTF-8 · LF</span>
            </div>
          </div>

          {activeWorkspace === "whiteboard" && (
            <div className="min-h-0 flex-1 bg-white">
              {yjsReady && ydocRef.current ? (
                <SyncedWhiteboard key={roomId} ydoc={ydocRef.current} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Connecting whiteboard...
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {actionError && (
        <p className="mt-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </p>
      )}
    </main>
  );

}

export default App;
