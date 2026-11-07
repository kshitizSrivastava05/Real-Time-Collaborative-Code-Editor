
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Editor } from "@monaco-editor/react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { removeAwarenessStates } from "y-protocols/awareness.js";
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
  Play,
  TerminalSquare,
  X,
  LoaderCircle,
  Users,
  MessageSquare,
  Send,
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




const GUEST_IDENTITY_KEY = "colab.guestIdentity.v1";

function buildRemoteCursorStyles(participants) {
  return participants
    .map((participant) => {
      const clientId = Number(participant.clientId);
      if (!Number.isSafeInteger(clientId) || clientId < 0) return "";

      const color = /^#[0-9a-fA-F]{6}$/.test(participant.color)
        ? participant.color
        : "#64748B";

      const safeName = String(participant.name || "Collaborator")
        .replace(/[^a-zA-Z0-9 _.-]/g, "")
        .slice(0, 32) || "Collaborator";

      const cursorClass = `.yRemoteSelectionHead-${clientId}`;
      const selectionClass = `.yRemoteSelection-${clientId}`;

      return `
        ${selectionClass} {
          background-color: ${color}38;
          border-bottom: 1px solid ${color}88;
          border-radius: 2px;
        }

        ${cursorClass} {
          position: absolute;
          box-sizing: border-box;
          height: 100%;
          border-left: 2px solid ${color};
          border-top: 1px solid ${color};
          border-bottom: 1px solid ${color};
          pointer-events: none;
          z-index: 10;
        }

        ${cursorClass}::after {
          content: "${safeName}";
          position: absolute;
          left: -2px;
          top: -19px;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          border-radius: 3px 3px 3px 0;
          padding: 2px 6px;
          background: ${color};
          color: #ffffff;
          font: 600 10px/14px Inter, ui-sans-serif, system-ui, sans-serif;
          letter-spacing: 0.01em;
          pointer-events: none;
          z-index: 20;
        }
      `;
    })
    .join("\n");
}

function getGuestIdentity() {
  try {
    const savedIdentity = sessionStorage.getItem(GUEST_IDENTITY_KEY);
    if (savedIdentity) {
      return JSON.parse(savedIdentity);
    }
  } catch {
    // Continue by creating a temporary identity.
  }

  const colors = [
    "#2563EB",
    "#7C3AED",
    "#0F766E",
    "#C2410C",
    "#BE185D",
    "#4D7C0F",
  ];

  const randomId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const identity = {
    id: `guest-${randomId}`,
    name: `Guest ${Math.floor(1000 + Math.random() * 9000)}`,
    color: colors[Math.floor(Math.random() * colors.length)],
  };

  try {
    sessionStorage.setItem(GUEST_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Presence still works for this page session without storage.
  }

  return identity;
}


const LOCAL_PROFILE_KEY = "colab.localProfile.v1";

function getLocalProfileId() {
  try {
    let profileId = localStorage.getItem(LOCAL_PROFILE_KEY);

    if (!profileId) {
      profileId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      localStorage.setItem(LOCAL_PROFILE_KEY, profileId);
    }

    return profileId;
  } catch {
    throw new Error(
      "Unable to access this browser's local profile. Enable local storage and try again."
    );
  }
}

function getRoomRequestHeaders(json = false) {
  return {
    "X-Guest-ID": getLocalProfileId(),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}


function getLanguageLabel(language) {
  const labels = {
    java: "Java",
    python: "Python",
    cpp: "C++",
    c: "C",
  };
  return labels[language] || language || "Plain Text";
}

function getMonacoLanguage(language) {
  // Monaco uses its C/C++ language service for both .c and .cpp files.
  return language === "c" ? "cpp" : language;
}

function App() {
  const roomId = new URLSearchParams(window.location.search).get("room");

  const [roomValid, setRoomValid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [yjsReady, setYjsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting");
  const [participants, setParticipants] = useState([]);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [createdRooms, setCreatedRooms] = useState([]);
  const [savedRooms, setSavedRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsLastUpdated, setRoomsLastUpdated] = useState(null);
  const [roomActionLoading, setRoomActionLoading] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("editor");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [executionStatus, setExecutionStatus] = useState("idle");
  const [isRunning, setIsRunning] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("disconnected");
  const [chatError, setChatError] = useState("");
  const [chatConnectionVersion, setChatConnectionVersion] = useState(0);
  const [chatUserId, setChatUserId] = useState("");

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
  const guestIdentityRef = useRef(null);
  const executionSocketRef = useRef(null);
  const terminalOutputRef = useRef(null);
  const terminalInputRef = useRef(null);
  const chatSocketRef = useRef(null);
  const chatMessagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const [editorFocused, setEditorFocused] = useState(false);

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
      py: "python",
      java: "java",
      cpp: "cpp",
      c: "c",
    };

    const language = languageMap[extension];

    if (!language) {
      setActionError(
        "Supported files: .java, .py, .cpp and .c. Please use one of these extensions."
      );
      return;
    }

    const newFile = {
      id: crypto.randomUUID(),
      name,
      language,
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


  const refreshRoomLists = async (showLoading = false) => {
    if (showLoading) setRoomsLoading(true);

    try {
      const headers = getRoomRequestHeaders();
      const [createdResponse, savedResponse] = await Promise.all([
        fetch("http://127.0.0.1:8000/rooms/created", {
          headers,
          cache: "no-store",
        }),
        fetch("http://127.0.0.1:8000/rooms/saved", {
          headers,
          cache: "no-store",
        }),
      ]);

      const [createdData, savedData] = await Promise.all([
        createdResponse.json().catch(() => ({})),
        savedResponse.json().catch(() => ({})),
      ]);

      if (!createdResponse.ok || !savedResponse.ok) {
        const errorMessage =
          createdData.detail ||
          savedData.detail ||
          `Could not load room lists (created: ${createdResponse.status}, saved: ${savedResponse.status}).`;
        throw new Error(errorMessage);
      }

      setCreatedRooms(
        Array.isArray(createdData.rooms) ? createdData.rooms : []
      );
      setSavedRooms(
        Array.isArray(savedData.rooms) ? savedData.rooms : []
      );
      setRoomsLastUpdated(new Date());
      setActionError("");

      return true;
    } catch (error) {
      setActionError(error.message || "Unable to refresh your room lists.");
      return false;
    } finally {
      if (showLoading) setRoomsLoading(false);
    }
  };

  const notifyRoomListsChanged = () => {
    try {
      localStorage.setItem(
        "colab.rooms.changed",
        `${Date.now()}-${Math.random().toString(16).slice(2)}`
      );
    } catch {
      // Cross-tab notification is an enhancement; periodic refresh still works.
    }
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
        headers: getRoomRequestHeaders(true),
        body: JSON.stringify({ name: roomName }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Unable to create room.");
      }

      await refreshRoomLists();
      notifyRoomListsChanged();
      window.location.href = `/?room=${encodeURIComponent(data.room_id)}`;
    } catch (error) {
      setActionError(error.message || "Something went wrong.");
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
        `http://127.0.0.1:8000/rooms/${encodeURIComponent(id)}/join`,
        {
          method: "POST",
          headers: getRoomRequestHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.detail || "Room not found. Check the room ID and try again."
        );
      }

      await refreshRoomLists();
      notifyRoomListsChanged();
      window.location.href = `/?room=${encodeURIComponent(id)}`;
    } catch (error) {
      setActionError(error.message || "Unable to join this room.");
      setJoiningRoom(false);
    }
  };

  const handleOpenRoom = (room) => {
    window.location.href = `/?room=${encodeURIComponent(room.room_id)}`;
  };

  const handleDeleteOwnedRoom = async (room) => {
    const confirmed = window.confirm(
      `Delete "${room.name}" permanently? This deletes the source room for everyone and cannot be undone.`
    );
    if (!confirmed) return;

    setRoomActionLoading(room.room_id);
    setActionError("");

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/rooms/${encodeURIComponent(room.room_id)}`,
        {
          method: "DELETE",
          headers: getRoomRequestHeaders(),
        }
      );

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || "The server could not delete this room.");
      }

      await refreshRoomLists();
      notifyRoomListsChanged();
    } catch (error) {
      setActionError(error.message || "Unable to delete this room.");
    } finally {
      setRoomActionLoading("");
    }
  };

  const handleRemoveSavedRoom = async (room) => {
    const confirmed = window.confirm(
      `Remove "${room.name}" from your Saved Rooms? The room will remain available to its owner and other members.`
    );
    if (!confirmed) return;

    setRoomActionLoading(room.room_id);
    setActionError("");

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/rooms/${encodeURIComponent(room.room_id)}/saved`,
        {
          method: "DELETE",
          headers: getRoomRequestHeaders(),
        }
      );

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || "Unable to remove this saved room.");
      }

      await refreshRoomLists();
      notifyRoomListsChanged();
    } catch (error) {
      setActionError(error.message || "Unable to remove this saved room.");
    } finally {
      setRoomActionLoading("");
    }
  };

  const handleSendChatMessage = (event) => {
    event?.preventDefault();

    const content = chatDraft.trim();
    const socket = chatSocketRef.current;

    if (!content || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "message",
        content,
      })
    );

    setChatDraft("");
    chatInputRef.current?.focus();
  };

  const handleChatInputKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendChatMessage();
    }
  };

  const reconnectChat = () => {
    const socket = chatSocketRef.current;
    if (socket) {
      socket.close();
      chatSocketRef.current = null;
    }

    setChatStatus("connecting");
    setChatError("");
    setChatConnectionVersion((version) => version + 1);
  };

  const handleBackHome = () => {
    const socket = chatSocketRef.current;
    if (socket) socket.close(1000, "Leaving room");
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
    const terminal = terminalOutputRef.current;
    if (terminal) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }, [terminalOutput]);

  useEffect(() => {
    if (roomId) return;

    let cancelled = false;
    let requestInProgress = false;

    const loadRoomLists = async (showLoading = false) => {
      if (requestInProgress || cancelled) return;
      requestInProgress = true;

      if (showLoading) setRoomsLoading(true);

      try {
        const headers = getRoomRequestHeaders();
        const [createdResponse, savedResponse] = await Promise.all([
          fetch("http://127.0.0.1:8000/rooms/created", {
            headers,
            cache: "no-store",
          }),
          fetch("http://127.0.0.1:8000/rooms/saved", {
            headers,
            cache: "no-store",
          }),
        ]);

        const [createdData, savedData] = await Promise.all([
          createdResponse.json().catch(() => ({})),
          savedResponse.json().catch(() => ({})),
        ]);

        if (!createdResponse.ok || !savedResponse.ok) {
          throw new Error(
            createdData.detail ||
              savedData.detail ||
              `Room list request failed (created: ${createdResponse.status}, saved: ${savedResponse.status}).`
          );
        }

        if (!cancelled) {
          setCreatedRooms(
            Array.isArray(createdData.rooms) ? createdData.rooms : []
          );
          setSavedRooms(
            Array.isArray(savedData.rooms) ? savedData.rooms : []
          );
          setRoomsLastUpdated(new Date());
          setActionError("");
        }
      } catch (error) {
        if (!cancelled) {
          setActionError(error.message || "Unable to load your rooms.");
        }
      } finally {
        requestInProgress = false;
        if (showLoading && !cancelled) setRoomsLoading(false);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        loadRoomLists(false);
      }
    };

    const refreshAfterLocalChange = () => loadRoomLists(false);

    loadRoomLists(true);

    // Keep the landing page in sync with joins/removals/deletions from other
    // tabs, browser profiles, or collaborators. Polling also covers other
    // browsers where BroadcastChannel/storage events cannot be shared.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadRoomLists(false);
      }
    }, 3000);

    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("storage", refreshAfterLocalChange);
    window.addEventListener("colab:rooms-changed", refreshAfterLocalChange);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("storage", refreshAfterLocalChange);
      window.removeEventListener("colab:rooms-changed", refreshAfterLocalChange);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [roomId]);

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

    editor.onDidFocusEditorText(() => {
      setEditorFocused(true);
    });

    editor.onDidBlurEditorText(() => {
      setEditorFocused(false);
    });

    setEditorReady(true);
  };

  const appendTerminalOutput = (text) => {
    if (!text) return;
    setTerminalOutput((current) => current + text);
  };

  const stopExecution = (closeSocket = true) => {
    const socket = executionSocketRef.current;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
    }

    if (closeSocket && socket) {
      socket.close();
      executionSocketRef.current = null;
    }

    setIsRunning(false);
    setExecutionStatus("stopped");
  };

  const handleRunCode = () => {
    const language = activeFile?.language;
    const supportedLanguages = ["java", "python", "cpp", "c"];

    setTerminalOpen(true);
    setTerminalOutput("");
    setTerminalInput("");

    if (!supportedLanguages.includes(language)) {
      appendTerminalOutput(
        `Unsupported file language. Use Java, Python, C++ or C.\n`
      );
      setExecutionStatus("error");
      return;
    }

    const sourceExtension = activeFile?.name?.split(".").pop()?.toLowerCase();
    const expectedExtension = {
      java: "java",
      python: "py",
      cpp: "cpp",
      c: "c",
    }[language];

    if (sourceExtension !== expectedExtension) {
      appendTerminalOutput(
        `The ${getLanguageLabel(language)} runner requires a .${expectedExtension} file.\n`
      );
      setExecutionStatus("error");
      return;
    }

    const currentCode = editorRef.current?.getValue();

    if (!currentCode?.trim()) {
      appendTerminalOutput("There is no code to run.\n");
      setExecutionStatus("error");
      return;
    }

    const previousSocket = executionSocketRef.current;
    if (previousSocket) {
      if (previousSocket.readyState === WebSocket.OPEN) {
        previousSocket.send(JSON.stringify({ type: "stop" }));
      }
      previousSocket.close();
      executionSocketRef.current = null;
    }

    setIsRunning(true);
    setExecutionStatus("connecting");
    appendTerminalOutput(
      `[co.lab] Starting ${getLanguageLabel(language)} program...\n`
    );

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.hostname}:8000/execute/ws`;
    const socket = new WebSocket(socketUrl);
    executionSocketRef.current = socket;

    socket.onopen = () => {
      setExecutionStatus("running");
      socket.send(
        JSON.stringify({
          type: "run",
          language,
          filename: activeFile.name,
          code: currentCode,
        })
      );
      terminalInputRef.current?.focus();
    };

    socket.onmessage = (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        appendTerminalOutput(event.data);
        return;
      }

      if (message.type === "started") {
        setExecutionStatus("running");
        return;
      }

      if (message.type === "output") {
        appendTerminalOutput(message.data || "");
        return;
      }

      if (message.type === "error") {
        appendTerminalOutput(`\n[Error] ${message.message || "Execution failed."}\n`);
        setExecutionStatus("error");
        setIsRunning(false);
        return;
      }

      if (message.type === "exit") {
        appendTerminalOutput(
          `\n[Process exited with code ${message.exit_code}]` +
            (message.execution_time_ms != null
              ? ` (${message.execution_time_ms} ms)`
              : "") +
            "\n"
        );
        setExecutionStatus(
          message.exit_code === 0 ? "finished" : "error"
        );
        setIsRunning(false);
        executionSocketRef.current = null;
      }
    };

    socket.onerror = () => {
      appendTerminalOutput(
        "\n[Connection error] Could not connect to the execution service. Check FastAPI and Docker.\n"
      );
      setExecutionStatus("error");
      setIsRunning(false);
    };

    socket.onclose = () => {
      if (executionSocketRef.current === socket) {
        executionSocketRef.current = null;
        setIsRunning(false);
        setExecutionStatus((current) =>
          current === "running" || current === "connecting"
            ? "disconnected"
            : current
        );
      }
    };
  };

  const handleTerminalInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      const socket = executionSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !isRunning) {
        return;
      }

      const line = terminalInput;
      socket.send(
        JSON.stringify({
          type: "stdin",
          data: `${line}\n`,
        })
      );

      // Echo the typed input into the same terminal stream, like a terminal.
      appendTerminalOutput(`${line}\n`);
      setTerminalInput("");
      return;
    }

    if (event.key.toLowerCase() === "c" && event.ctrlKey) {
      event.preventDefault();
      appendTerminalOutput("^C\n");
      stopExecution();
    }
  };

  const handleTerminalClose = () => {
    if (isRunning) stopExecution();
    setTerminalOpen(false);
  };

  useEffect(() => {
    if (!roomId || !roomValid || !chatOpen) {
      return;
    }

    let disposed = false;
    const profileId = getLocalProfileId();
    const guestIdentity = getGuestIdentity();

    setChatUserId(profileId);
    setChatStatus("connecting");
    setChatError("");
    setChatMessages([]);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({
      guest_id: profileId,
      display_name: guestIdentity.name || "Guest",
      display_color: guestIdentity.color || "#64748B",
    });

    const socketUrl =
      `${protocol}//${window.location.hostname}:8000/ws/chat/` +
      `${encodeURIComponent(roomId)}?${params.toString()}`;

    const socket = new WebSocket(socketUrl);
    chatSocketRef.current = socket;

    socket.onopen = () => {
      if (disposed) return;
      setChatStatus("connected");
      setChatError("");
    };

    socket.onmessage = (event) => {
      if (disposed) return;

      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "history") {
        setChatMessages(
          Array.isArray(payload.messages) ? payload.messages : []
        );
        return;
      }

      if (payload.type === "message" && payload.message) {
        setChatMessages((current) => {
          if (current.some((item) => item.id === payload.message.id)) {
            return current;
          }

          return [...current, payload.message];
        });
        return;
      }

      if (payload.type === "error") {
        setChatError(payload.message || "Chat error.");
      }
    };

    socket.onerror = () => {
      if (disposed) return;
      setChatStatus("error");
      setChatError(
        "Unable to connect to room chat. Check that the FastAPI chat router is registered."
      );
    };

    socket.onclose = (event) => {
      if (disposed) return;
      chatSocketRef.current = null;

      if (event.code === 1008) {
        setChatStatus("error");
        setChatError(
          "You are not a member of this room. Join the room before opening chat."
        );
        return;
      }

      setChatStatus("disconnected");
    };

    return () => {
      disposed = true;
      if (chatSocketRef.current === socket) {
        chatSocketRef.current = null;
      }
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, "Chat panel closed");
      }
    };
  }, [roomId, roomValid, chatOpen, chatConnectionVersion]);

  useEffect(() => {
    if (!chatOpen || !chatMessagesEndRef.current) return;

    chatMessagesEndRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, chatOpen]);

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
    const awareness = provider.awareness;
    const savedGuestIdentity = getGuestIdentity();
    const guestIdentity = {
      ...savedGuestIdentity,
      sessionId:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      connectedAt: Date.now(),
    };
    guestIdentityRef.current = guestIdentity;

    awareness.setLocalStateField("user", guestIdentity);

    const syncParticipants = () => {
      const participantsByUser = new Map();

      for (const [clientId, state] of awareness.getStates().entries()) {
        if (!state?.user?.id || !state?.user?.name) continue;

        const activity = state.activity || {};
        const participant = {
          clientId,
          id: state.user.id,
          name: state.user.name,
          color: state.user.color || "#64748B",
          activityLabel: activity.label || "In this room",
          connectedAt: Number(state.user.connectedAt) || 0,
        };

        const existing = participantsByUser.get(participant.id);
        const isCurrentClient = clientId === awareness.clientID;
        const existingIsCurrentClient =
          existing?.clientId === awareness.clientID;

        // A refresh creates a new Yjs clientID but retains the same guest user ID.
        // Prefer this page's own entry, otherwise keep the newest session entry.
        if (
          !existing ||
          isCurrentClient ||
          (!existingIsCurrentClient &&
            participant.connectedAt > existing.connectedAt)
        ) {
          participantsByUser.set(participant.id, participant);
        }
      }

      setParticipants(
        Array.from(participantsByUser.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
    };

    awareness.on("change", syncParticipants);
    syncParticipants();

    let awarenessRemovedOnExit = false;
    const removeCurrentAwareness = () => {
      if (awarenessRemovedOnExit) return;
      awarenessRemovedOnExit = true;

      removeAwarenessStates(
        awareness,
        [ydoc.clientID],
        "co.lab page exit"
      );
    };

    window.addEventListener("beforeunload", removeCurrentAwareness);
    window.addEventListener("pagehide", removeCurrentAwareness);

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
          name: "Main.java",
          language: "java",
        });
      }

      const mainText = ydoc.getText("file:main-file");

      if (mainText.length === 0) {
        if (legacyText.length > 0) {
          mainText.insert(0, legacyText.toString());
        } else {
          mainText.insert(
            0,
            'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from co.lab");\n    }\n}'
          );
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
      awareness.off("change", syncParticipants);

      window.removeEventListener("beforeunload", removeCurrentAwareness);
      window.removeEventListener("pagehide", removeCurrentAwareness);
      removeCurrentAwareness();

      destroyMonacoBinding(bindingRef);

      modelsRef.current.forEach((model) => model.dispose());
      modelsRef.current.clear();

      provider.destroy();
      ydoc.destroy();

      setParticipants([]);
      guestIdentityRef.current = null;
      setEditorFocused(false);
      setYjsReady(false);
      ydocRef.current = null;
      providerRef.current = null;
    };
  }, [roomValid, editorReady, roomId]);

  useEffect(() => {
    if (!yjsReady || !providerRef.current || !activeFile) return;

    const awareness = providerRef.current.awareness;
    const activityLabel =
      activeWorkspace === "whiteboard"
        ? "Viewing whiteboard"
        : `${editorFocused ? "Editing" : "Viewing"} ${activeFile.name}`;

    awareness.setLocalStateField("activity", {
      workspace: activeWorkspace,
      fileId: activeWorkspace === "editor" ? activeFile.id : null,
      fileName: activeWorkspace === "editor" ? activeFile.name : null,
      mode:
        activeWorkspace === "editor" && editorFocused
          ? "editing"
          : "viewing",
      label: activityLabel,
    });
  }, [
    yjsReady,
    activeWorkspace,
    activeFileId,
    activeFile?.name,
    editorFocused,
  ]);

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
        getMonacoLanguage(file.language || "plaintext"),
        monacoRef.current.Uri.parse(
          `inmemory://co-lab/${encodeURIComponent(file.id)}`
        )
      );
      modelsRef.current.set(file.id, model);
    } else {
      monacoRef.current.editor.setModelLanguage(
        model,
        getMonacoLanguage(file.language || "plaintext")
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

          <section className="border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Your Rooms</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Rooms you created. You are the owner and can delete the source room.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {createdRooms.length} created
                </span>
                <span className="text-[11px] text-emerald-700">Live updates</span>
              </div>
            </div>

            {roomsLoading ? (
              <p className="mt-4 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Loading your rooms...
              </p>
            ) : createdRooms.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                You haven't created any rooms yet. Create a room above to see it here.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {createdRooms.map((room) => (
                  <div
                    key={room.room_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{room.name}</p>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          Owner
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">
                        {room.room_id}
                        <span className="ml-2 font-sans">
                          · {room.member_count ?? 1} members
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRoom(room)}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOwnedRoom(room)}
                        disabled={roomActionLoading === room.room_id}
                        title="Permanently delete this room for everyone"
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {roomActionLoading === room.room_id ? "Deleting..." : "Delete room"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              <strong>Delete room:</strong> permanently removes the source room. Other members will no longer be able to access it.
            </div>
          </section>

          <section className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Saved Rooms</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Rooms you joined using a room ID or invite.
                  {roomsLastUpdated && (
                    <span className="ml-2 text-emerald-700">
                      Updated {roomsLastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {savedRooms.length} saved
                </span>
                <span className="text-[11px] text-emerald-700">Live updates</span>
              </div>
            </div>

            {roomsLoading ? (
              <p className="mt-4 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Loading saved rooms...
              </p>
            ) : savedRooms.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                No saved rooms yet. Join someone else's room and it will appear here.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {savedRooms.map((room) => (
                  <div
                    key={room.room_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{room.name}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Joined
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">
                        {room.room_id}
                        <span className="ml-2 font-sans">
                          · {room.member_count ?? 1} members
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRoom(room)}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveSavedRoom(room)}
                        disabled={roomActionLoading === room.room_id}
                        title="Remove only from your Saved Rooms list"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {roomActionLoading === room.room_id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <strong>Remove from Saved Rooms:</strong> only removes the room from your list. It does not delete the source room or remove other members.
            </div>
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
    <>
      <style>{`
        .yRemoteSelection {
          border-radius: 2px;
        }

        .yRemoteSelectionHead {
          position: absolute;
          box-sizing: border-box;
          height: 100%;
          pointer-events: none;
        }

        ${buildRemoteCursorStyles(participants)}
      `}</style>

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

          <div
            className="flex items-center gap-2 rounded-md px-2 py-1.5"
            title={participants.map((participant) => participant.name).join(", ")}
            aria-label={`${participants.length} participants online`}
          >
            <div className="flex items-center -space-x-2">
              {participants.slice(0, 4).map((participant) => (
                <span
                  key={participant.clientId}
                  title={participant.name}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
                  style={{ backgroundColor: participant.color }}
                >
                  {participant.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {participants.length > 4 && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-600 text-[10px] font-semibold text-white">
                  +{participants.length - 4}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <Users size={14} />
              {participants.length} online
            </span>
          </div>

          <span className="flex items-center gap-2 rounded-md px-2 py-2 text-slate-600">
            <Circle
              size={8}
              fill={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
              color={connectionStatus === "Connected" ? "#16A34A" : "#D97706"}
            />
            {connectionStatus}
          </span>
          <button
            type="button"
            onClick={() => setChatOpen((open) => !open)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 ${
              chatOpen
                ? "border-slate-800 bg-slate-900 text-white"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
            aria-pressed={chatOpen}
          >
            <MessageSquare size={14} />
            Chat
          </button>
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
          <section className="flex min-h-0 flex-1 flex-col border-b border-slate-200">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-3">
              <span className="text-xs font-semibold text-slate-600">PROJECT FILES</span>
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
                  className="mb-2 shrink-0 space-y-2"
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

              <div
                className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#94A3B8 #F1F5F9" }}
              >
                {files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => {
                    setEditorFocused(false);
                    setActiveFileId(file.id);
                  }}
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
                {files.length === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-400">
                    No project files yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-3">
              <span className="text-xs font-semibold text-slate-600">PARTICIPANTS</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {participants.length} online
              </span>
            </div>

            <div
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 pr-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#94A3B8 #F1F5F9" }}
            >
              {participants.map((participant) => (
                <div
                  key={participant.clientId}
                  title={`${participant.name}: ${participant.activityLabel}`}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-100"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: participant.color }}
                  >
                    {(participant.id === guestIdentityRef.current?.id
                      ? "You"
                      : participant.name
                    ).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {participant.id === guestIdentityRef.current?.id
                        ? "You"
                        : participant.name}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {participant.activityLabel}
                    </span>
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
                    title="Online"
                  />
                </div>
              ))}

              {participants.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">
                  Waiting for participants...
                </p>
              )}
            </div>
          </section>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-2">
            <div className="flex items-center gap-1 py-1">
              <button
                onClick={() => { setEditorFocused(false); setActiveWorkspace("editor"); }}
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
                onClick={() => { setEditorFocused(false); setActiveWorkspace("whiteboard"); }}
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

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden truncate px-2 text-xs text-slate-500 sm:block">
                {activeWorkspace === "editor"
                  ? `${activeFile?.name || "Main.java"} · ${getLanguageLabel(activeFile?.language)}`
                  : "Shared canvas"}
              </span>
              {activeWorkspace === "editor" && (
                <>
                  <button
                    onClick={() => {
                      if (terminalOpen) {
                        handleTerminalClose();
                      } else {
                        setTerminalOpen(true);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium ${
                      terminalOpen
                        ? "border-slate-400 bg-slate-100 text-slate-900"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <TerminalSquare size={14} />
                    Terminal
                  </button>
                  <button
                    onClick={handleRunCode}
                    disabled={isRunning || !editorReady || !activeFile}
                    className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    {isRunning ? "Running" : "Run"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            className={`min-h-0 flex-1 flex-col ${
              activeWorkspace === "editor" ? "flex" : "hidden"
            }`}
          >
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                defaultLanguage="java"
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
              <span>{getLanguageLabel(activeFile?.language)}</span>
              <span>UTF-8 · LF</span>
            </div>

            {terminalOpen && (
              <section className="flex h-64 shrink-0 flex-col border-t border-slate-300 bg-[#0C0C0C]">
                <div className="flex shrink-0 items-center justify-between border-b border-[#303030] bg-[#181818] px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-300">
                    <TerminalSquare size={14} />
                    TERMINAL
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        executionStatus === "running"
                          ? "bg-emerald-950 text-emerald-400"
                          : executionStatus === "error"
                            ? "bg-red-950 text-red-400"
                            : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {executionStatus === "running"
                        ? "RUNNING"
                        : executionStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setTerminalOutput("")}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                    {isRunning && (
                      <button
                        type="button"
                        onClick={() => {
                          appendTerminalOutput("^C\n");
                          stopExecution();
                        }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Stop
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleTerminalClose}
                      className="rounded p-1 text-slate-400 hover:bg-[#303030] hover:text-white"
                      aria-label="Close terminal"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div
                  ref={terminalOutputRef}
                  className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-5 text-[#D4D4D4]"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {terminalOutput || (
                    <span className="text-slate-500">
                      Press Run to start the program. Program output and errors will appear here.
                    </span>
                  )}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (terminalInput.trim() || terminalInput.length === 0) {
                      handleTerminalInputKeyDown({
                        key: "Enter",
                        preventDefault: () => {},
                        ctrlKey: false,
                      });
                    }
                  }}
                  className="flex shrink-0 items-center gap-2 border-t border-[#303030] px-3 py-2 font-mono"
                >
                  <span className="select-none text-emerald-400">&gt;</span>
                  <input
                    ref={terminalInputRef}
                    type="text"
                    value={terminalInput}
                    onChange={(event) => setTerminalInput(event.target.value)}
                    onKeyDown={handleTerminalInputKeyDown}
                    disabled={!isRunning || executionStatus !== "running"}
                    placeholder={
                      isRunning
                        ? "Type program input and press Enter..."
                        : "Run a program to enter input..."
                    }
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[#D4D4D4] outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
                  />
                </form>
              </section>
            )}
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

        {chatOpen && (
          <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-200 bg-white sm:w-80">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-700" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">
                    Room Chat
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Messages are visible to room members
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    chatStatus === "connected"
                      ? "bg-emerald-500"
                      : chatStatus === "connecting"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  title={chatStatus}
                />
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Close room chat"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
              {chatStatus === "connecting" && (
                <p className="mb-3 text-center text-xs text-slate-500">
                  Connecting to room chat...
                </p>
              )}

              {chatError && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <p>{chatError}</p>
                  <button
                    type="button"
                    onClick={reconnectChat}
                    className="mt-2 font-semibold underline"
                  >
                    Retry connection
                  </button>
                </div>
              )}

              {chatMessages.length === 0 && chatStatus === "connected" && (
                <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                  <MessageSquare size={26} className="text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">
                    No messages yet
                  </p>
                  <p className="mt-1 max-w-52 text-xs text-slate-400">
                    Start a conversation with everyone in this room.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {chatMessages.map((message) => {
                  const isOwnMessage = message.sender_id === chatUserId;

                  return (
                    <div
                      key={message.id}
                      className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`flex max-w-[88%] items-end gap-2 ${
                          isOwnMessage ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {!isOwnMessage && (
                          <span
                            className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{
                              backgroundColor: message.sender_color || "#64748B",
                            }}
                            title={message.sender_name || "Guest"}
                          >
                            {(message.sender_name || "G").slice(0, 1).toUpperCase()}
                          </span>
                        )}

                        <div
                          className={`min-w-0 rounded-2xl px-3 py-2 shadow-sm ${
                            isOwnMessage
                              ? "rounded-br-sm bg-emerald-100 text-slate-800"
                              : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          {!isOwnMessage && (
                            <p
                              className="mb-1 text-[11px] font-semibold"
                              style={{ color: message.sender_color || "#475569" }}
                            >
                              {message.sender_name || "Guest"}
                            </p>
                          )}

                          <p className="whitespace-pre-wrap break-words text-sm leading-5">
                            {message.content}
                          </p>

                          <div
                            className={`mt-1 text-right text-[10px] ${
                              isOwnMessage ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {message.created_at
                              ? new Date(message.created_at).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" }
                                )
                              : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatMessagesEndRef} />
              </div>
            </div>

            <form
              onSubmit={handleSendChatMessage}
              className="shrink-0 border-t border-slate-200 bg-white p-3"
            >
              <div className="rounded-lg border border-slate-300 bg-white p-2 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-300">
                <textarea
                  ref={chatInputRef}
                  rows={2}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={handleChatInputKeyDown}
                  disabled={chatStatus !== "connected"}
                  maxLength={2000}
                  placeholder={
                    chatStatus === "connected"
                      ? "Message everyone in this room..."
                      : "Connect to chat to send a message..."
                  }
                  className="w-full resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">
                    Enter to send · Shift + Enter for a new line
                  </span>
                  <button
                    type="submit"
                    disabled={
                      chatStatus !== "connected" || !chatDraft.trim()
                    }
                    className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={12} />
                    Send
                  </button>
                </div>
              </div>
            </form>
          </aside>
        )}
      </section>

      {actionError && (
        <p className="mt-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </p>
      )}
      </main>
    </>
  );

}

export default App;
