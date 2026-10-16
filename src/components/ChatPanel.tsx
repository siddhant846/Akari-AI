import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  X,
  Bot,
  Trash2,
  Terminal,
  Paperclip,
  Image as ImageIcon,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileCheck,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProcessedFile, processUploadFile } from "../lib/fileProcessor";

export interface ChatMessage {
  id: string;
  sender: "user" | "akari" | "system";
  text: string;
  timestamp: string;
  emotion?: string;
  toolCall?: string;
  attachment?: {
    name: string;
    category: "image" | "pdf" | "document" | "code";
    formattedSize: string;
    previewUrl?: string;
    textContent?: string;
    totalPages?: number;
  };
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment?: ProcessedFile) => void;
  onClearMessages: () => void;
  isConnecting?: boolean;
  isConnected?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearMessages,
  isConnecting = false,
  isConnected = false,
}) => {
  const [inputText, setInputText] = useState("");
  const [attachedFile, setAttachedFile] = useState<ProcessedFile | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, attachedFile]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsProcessingFile(true);
    try {
      const processed = await processUploadFile(file);
      setAttachedFile(processed);
    } catch (err) {
      console.error("Failed to process attached file:", err);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setIsProcessingFile(true);
          try {
            const processed = await processUploadFile(file);
            setAttachedFile(processed);
          } catch (err) {
            console.error("Paste image processing failed:", err);
          } finally {
            setIsProcessingFile(false);
          }
          break;
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed && !attachedFile) return;

    onSendMessage(trimmed, attachedFile || undefined);
    setInputText("");
    setAttachedFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderFileIcon = (category: string, size = 16) => {
    switch (category) {
      case "image":
        return <ImageIcon size={size} className="text-cyan-400" />;
      case "pdf":
        return <FileText size={size} className="text-rose-400" />;
      case "code":
        return <FileCode size={size} className="text-amber-400" />;
      default:
        return <FileCheck size={size} className="text-emerald-400" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 340, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 340, scale: 0.96 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="fixed right-6 top-20 bottom-24 w-[420px] max-w-[calc(100vw-36px)] bg-black/88 backdrop-blur-3xl border border-cyan-500/35 rounded-2xl shadow-[0_0_60px_rgba(6,182,212,0.22)] z-50 flex flex-col overflow-hidden"
          style={{ clipPath: "polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)" }}
        >
          {/* Drag & Drop Visual Overlay */}
          <AnimatePresence>
            {isDraggingOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-cyan-950/90 border-2 border-dashed border-cyan-400 z-50 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center pointer-events-none"
              >
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center mb-4 text-cyan-300 animate-bounce">
                  <UploadCloud size={32} />
                </div>
                <h4 className="text-base font-bold font-mono text-white uppercase tracking-wider mb-1">
                  Drop Files for Review
                </h4>
                <p className="text-xs font-mono text-cyan-200/80">
                  Photos, PDFs, Code, and Documents
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <div className="px-5 py-4 border-b border-cyan-500/20 bg-cyan-950/30 flex items-center justify-between relative">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-300">
                <Bot size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-mono font-bold tracking-wider text-white uppercase">
                    AKARI NEURAL CHAT
                  </h3>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnected
                        ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                        : isConnecting
                        ? "bg-amber-400 animate-pulse"
                        : "bg-slate-600"
                    }`}
                  />
                </div>
                <p className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest mt-0.5">
                  Multimodal Review & Vision Stream
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={onClearMessages}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition cursor-pointer"
                  title="Clear Chat"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-cyan-500/20">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 font-mono">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                  <MessageSquare size={24} />
                </div>
                <p className="text-xs text-white font-bold mb-1 uppercase tracking-wider">
                  Direct Multimodal Link
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[260px]">
                  Send text or upload photos, documents, and PDFs. Akari reviews them with voice and transcript!
                </p>

                {/* Quick actions suggestions */}
                <div className="mt-4 flex flex-col gap-1.5 text-[10px] text-cyan-300/80 w-full max-w-[280px]">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-900/40 transition cursor-pointer flex items-center gap-2 text-left"
                  >
                    <Paperclip size={14} className="text-cyan-400" />
                    <span>📎 Upload document or photo to review</span>
                  </button>
                  <button
                    onClick={() => onSendMessage("What can you do?")}
                    className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-400/50 transition cursor-pointer text-left"
                  >
                    💡 &quot;What can you do?&quot;
                  </button>
                  <button
                    onClick={() => onSendMessage("Open YouTube and search lofi")}
                    className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-400/50 transition cursor-pointer text-left"
                  >
                    🎵 &quot;Open YouTube and search lofi&quot;
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender === "user";
                const isSys = msg.sender === "system";

                if (isSys) {
                  return (
                    <div
                      key={msg.id}
                      className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] font-mono text-cyan-300 flex items-center gap-2"
                    >
                      <Terminal size={14} className="text-cyan-400 shrink-0" />
                      <span className="flex-1">{msg.text}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] font-mono text-slate-400">
                      {isUser ? (
                        <>
                          <span>YOU</span>
                          <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-pink-400 font-bold">AKARI</span>
                          {msg.emotion && (
                            <span className={`px-1.5 py-0.2 rounded border text-[9px] uppercase font-mono ${
                              msg.emotion === "angry" ? "bg-rose-950/60 border-rose-500/50 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.4)]" :
                              msg.emotion === "annoyed" ? "bg-orange-950/60 border-orange-500/50 text-orange-300" :
                              msg.emotion === "flustered" ? "bg-pink-950/60 border-pink-500/50 text-pink-300 shadow-[0_0_8px_rgba(236,72,153,0.4)]" :
                              msg.emotion === "sleepy" ? "bg-purple-950/60 border-purple-500/50 text-purple-300" :
                              msg.emotion === "smug" ? "bg-amber-950/60 border-amber-500/50 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]" :
                              msg.emotion === "caring" ? "bg-teal-950/60 border-teal-500/50 text-teal-300" :
                              msg.emotion === "focused" ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]" :
                              msg.emotion === "happy" || msg.emotion === "excited" ? "bg-pink-500/20 border-pink-500/40 text-pink-300" :
                              msg.emotion === "sad" ? "bg-blue-950/60 border-blue-500/40 text-blue-300" :
                              "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                            }`}>
                              {msg.emotion}
                            </span>
                          )}
                          <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                        </>
                      )}
                    </div>

                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs font-mono leading-relaxed select-text ${
                        isUser
                          ? "bg-cyan-500/20 text-cyan-100 border border-cyan-400/40 rounded-tr-sm shadow-[0_0_18px_rgba(6,182,212,0.15)]"
                          : "bg-white/[0.06] text-slate-100 border border-white/10 rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
                      }`}
                    >
                      {/* Attachment Card Render */}
                      {msg.attachment && (
                        <div className="mb-2.5 rounded-xl border border-cyan-500/30 bg-black/50 p-2 overflow-hidden text-left">
                          {/* Image preview */}
                          {msg.attachment.category === "image" && msg.attachment.previewUrl && (
                            <div className="relative group mb-1.5 rounded-lg overflow-hidden border border-white/10 bg-black/60 max-h-48 flex items-center justify-center">
                              <img
                                src={msg.attachment.previewUrl}
                                alt={msg.attachment.name}
                                className="w-full h-auto object-cover max-h-48 cursor-pointer hover:scale-105 transition duration-300"
                                onClick={() => setSelectedImagePreview(msg.attachment?.previewUrl || null)}
                              />
                              <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-cyan-300 font-mono">
                                PHOTO
                              </div>
                            </div>
                          )}

                          {/* PDF & Document Header Info */}
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-2 truncate">
                              <div className="p-1.5 rounded-lg bg-white/10 shrink-0">
                                {renderFileIcon(msg.attachment.category, 15)}
                              </div>
                              <div className="truncate">
                                <p className="font-bold text-white truncate text-[11px]">
                                  {msg.attachment.name}
                                </p>
                                <p className="text-[9px] text-slate-400">
                                  {msg.attachment.formattedSize}
                                  {msg.attachment.totalPages ? ` • ${msg.attachment.totalPages} page(s)` : ""}
                                </p>
                              </div>
                            </div>

                            {msg.attachment.textContent && (
                              <button
                                onClick={() =>
                                  setExpandedPreviewId(
                                    expandedPreviewId === msg.id ? null : msg.id
                                  )
                                }
                                className="p-1 hover:bg-white/10 rounded text-cyan-300 text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                                title="Toggle file preview"
                              >
                                {expandedPreviewId === msg.id ? (
                                  <ChevronUp size={14} />
                                ) : (
                                  <ChevronDown size={14} />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Expandable Text Snippet */}
                          {expandedPreviewId === msg.id && msg.attachment.textContent && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-2 pt-2 border-t border-white/10 max-h-44 overflow-y-auto text-[10px] text-slate-300 font-mono whitespace-pre-wrap select-text bg-black/40 p-2 rounded-lg"
                            >
                              {msg.attachment.textContent}
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      {msg.text && <div className="break-words">{msg.text}</div>}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment Preview Chip (Staged for send) */}
          <AnimatePresence>
            {attachedFile && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="mx-3 mb-2 p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-400/50 flex items-center justify-between gap-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                <div className="flex items-center gap-2.5 truncate">
                  {attachedFile.previewUrl ? (
                    <img
                      src={attachedFile.previewUrl}
                      alt={attachedFile.name}
                      className="w-10 h-10 rounded-lg object-cover border border-cyan-400/40 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-black/40 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      {renderFileIcon(attachedFile.category, 20)}
                    </div>
                  )}
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate max-w-[200px]">
                        {attachedFile.name}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-[9px] font-mono text-cyan-300 uppercase">
                        {attachedFile.category}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400">
                      {attachedFile.formattedSize}
                      {attachedFile.totalPages ? ` • ${attachedFile.totalPages} page(s)` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setAttachedFile(null)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/10 rounded-lg transition cursor-pointer"
                    title="Remove attachment"
                  >
                    <X size={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Processing Indicator */}
          {isProcessingFile && (
            <div className="mx-3 mb-2 p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center gap-2 text-xs font-mono text-cyan-300">
              <Loader2 size={15} className="animate-spin text-cyan-400" />
              <span>Analyzing and extracting document content...</span>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.md,.py,.js,.ts,.tsx,.jsx,.json,.csv,.doc,.docx,.html,.css,.c,.cpp,.h,.java,.rs,.go,.sh,.bat,.sql,.xml,.log,.yaml,.yml"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-cyan-500/20 bg-black/70 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-cyan-500/20 hover:border-cyan-400/50 border border-white/10 text-cyan-400 transition cursor-pointer"
              title="Attach Photo, PDF, Code, or Document"
            >
              <Paperclip size={16} />
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={attachedFile ? `Ask Akari about ${attachedFile.name}...` : "Type message or paste/drop files..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="flex-1 px-3.5 py-2.5 bg-white/5 border border-cyan-500/20 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 focus:bg-white/10 transition"
            />

            <button
              type="submit"
              disabled={!inputText.trim() && !attachedFile}
              className="p-2.5 bg-gradient-to-r from-pink-500 to-cyan-500 hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-white transition cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            >
              <Send size={15} />
            </button>
          </form>

          {/* Full Screen Image Modal */}
          <AnimatePresence>
            {selectedImagePreview && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedImagePreview(null)}
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 cursor-zoom-out"
              >
                <img
                  src={selectedImagePreview}
                  alt="Full preview"
                  className="max-w-full max-h-full rounded-xl object-contain border border-white/20 shadow-2xl"
                />
                <button
                  onClick={() => setSelectedImagePreview(null)}
                  className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                >
                  <X size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
