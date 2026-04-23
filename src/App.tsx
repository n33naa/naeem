/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, FileText, Sparkles, Download, Search, Clock, Trash2, X, ListFilter, Zap, ShieldCheck, Type, Languages, Layers, Moon, Sun, Edit3, Save, MessageSquare, Split, ImageIcon, History, Table as TableIcon, Maximize2, Minimize2, CheckSquare, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import { extractTextFromPdfStream, processTextAction } from './lib/gemini';
import { FileUpload } from './components/FileUpload';

const QUICK_PROMPTS = [
  "List all dates and deadlines",
  "Summarize for a 5th grader",
  "Extract all price mentions",
  "Write a formal reply email",
  "Rewrite as a tweet thread"
];

interface HistoryItem {
  id: string;
  name: string;
  text: string;
  timestamp: number;
  size: string;
}

interface BatchItem {
  id: string;
  name: string;
  base64: string;
  size: number;
  type: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  text?: string;
}

export default function App() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('textract_theme') === 'dark' || 
             (!localStorage.getItem('textract_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [viewerSearchQuery, setViewerSearchQuery] = useState('');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [aiQuery, setAiQuery] = useState('');
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [processedText, setProcessedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'processed'>('raw');
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('textract_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExtractedText(null);
        setProcessedText(null);
        setIsEditing(false);
        setShowExportMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleDownload('pdf');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [extractedText, processedText]);

  useEffect(() => {
    localStorage.setItem('textract_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('textract_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Handle batch queue processing
  useEffect(() => {
    const processQueue = async () => {
      const nextItem = batchQueue.find(item => item.status === 'pending');
      if (!nextItem || isExtracting) return;

      const itemId = nextItem.id || Math.random().toString(36).substr(2, 9);
      
      setBatchQueue(prev => prev.map(item => (item.id === itemId || (item.name === nextItem.name && item.status === 'pending')) ? { ...item, status: 'processing', id: itemId } : item));
      setIsExtracting(true);
      setExtractedText(""); 
      setProcessedText(null);
      setActiveTab('raw');
      setIsEditing(false);

      try {
        const stream = extractTextFromPdfStream(nextItem.base64, nextItem.type);
        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk;
          setExtractedText(fullText);
        }
        
        if (fullText) {
          const newItem: HistoryItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: nextItem.name,
            text: fullText,
            timestamp: Date.now(),
            size: (nextItem.size / 1024 / 1024).toFixed(2) + ' MB'
          };
          setHistory(prev => [newItem, ...prev].slice(0, 10));
          setBatchQueue(prev => prev.map(item => item.id === itemId ? { ...item, status: 'done', text: fullText } : item));
        } else {
          setBatchQueue(prev => prev.map(item => item.id === itemId ? { ...item, status: 'error' } : item));
        }
      } catch (err) {
        console.error(err);
        setBatchQueue(prev => prev.map(item => item.id === itemId ? { ...item, status: 'error' } : item));
      } finally {
        setIsExtracting(false);
      }
    };

    processQueue();
  }, [batchQueue, isExtracting]);

  const handleFilesSelect = (files: { base64: string; name: string; size: number; type: string }[]) => {
    const newItems: BatchItem[] = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      base64: f.base64,
      size: f.size,
      type: f.type,
      status: 'pending'
    }));
    setBatchQueue(prev => [...prev, ...newItems]);
    setError(null);
  };

  const clearQueue = () => setBatchQueue([]);

  const handleSmartAction = async (action: 'summarize' | 'insights' | 'formalize' | 'translate' | 'custom' | 'table') => {
    const textToProcess = activeTab === 'raw' ? extractedText : processedText;
    if (!textToProcess || isProcessing) return;
    
    // If custom and no query, don't run
    if (action === 'custom' && !aiQuery.trim()) return;

    setIsProcessing(true);
    setCurrentAction(action === 'custom' ? 'answering' : action);
    setProcessedText(null);
    setActiveTab('processed');
    setIsEditing(false);

    try {
      const result = await processTextAction(textToProcess, action as any, aiQuery);
      setProcessedText(result);
      if (action === 'custom') setAiQuery('');
    } catch (err) {
      console.error(err);
      setError(`Failed to ${action} text. Please try again.`);
      setActiveTab('raw');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = activeTab === 'raw' ? extractedText : processedText;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = (format: 'txt' | 'pdf' = 'txt') => {
    const textToDownload = activeTab === 'raw' ? extractedText : processedText;
    if (!textToDownload) return;

    if (format === 'txt') {
      const blob = new Blob([textToDownload], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `textract-${activeTab}-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const doc = new jsPDF();
      const margin = 15;
      const width = doc.internal.pageSize.getWidth() - 2 * margin;
      const lines = doc.splitTextToSize(textToDownload, width);
      doc.text(lines, margin, 20);
      doc.save(`textract-${activeTab}-${Date.now()}.pdf`);
    }
    setShowExportMenu(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeTab === 'raw') setExtractedText(e.target.value);
    else setProcessedText(e.target.value);
  };

  const deleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if (confirm('Clear all extraction history?')) {
      setHistory([]);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return history;
    return history.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [history, searchQuery]);

  const toggleHistorySelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedHistoryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const deleteSelectedHistory = () => {
    if (confirm(`Delete ${selectedHistoryIds.length} items?`)) {
      setHistory(prev => prev.filter(item => !selectedHistoryIds.includes(item.id)));
      setSelectedHistoryIds([]);
    }
  };

  const stats = useMemo(() => {
    const text = activeTab === 'raw' ? extractedText : processedText;
    if (!text) return { words: 0, chars: 0 };
    return {
      words: text.trim().split(/\s+/).length,
      chars: text.length
    };
  }, [extractedText, processedText, activeTab]);

  const formatTime = (ts: number) => {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0F1115] text-[#1A1A1A] dark:text-[#E2E8F0] font-sans selection:bg-black dark:selection:bg-white selection:text-white dark:selection:text-black transition-colors duration-300">
      {/* Header */}
      {!isFocusMode && (
        <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 dark:bg-[#0F1115]/80 backdrop-blur-md border-b border-slate-100 dark:border-white/5 z-50 px-8 lg:px-16 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center">
                <FileText size={20} className="text-white dark:text-black" />
              </div>
              <h1 className="text-xl font-bold tracking-tighter">Textract</h1>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#" className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A] dark:text-white">Workspace</a>
              <a href="#" className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A]/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors">Documents</a>
              <a href="#" className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A]/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors">API</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 hover:text-black dark:hover:text-white rounded-xl transition-all"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-white/5 rounded-full border border-slate-100 dark:border-white/5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Ready</span>
            </div>
          </div>
        </header>
      )}

      <main className={`max-w-7xl mx-auto px-16 transition-all duration-500 ${isFocusMode ? 'py-8' : 'py-12 md:py-24'}`}>
        {!isFocusMode && (
          <>
            {/* Hero Section */}
            <div className="text-center mb-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="text-4xl font-medium tracking-tight text-slate-900 dark:text-white mb-3">
                  Turn documents into data.
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                  High-precision OCR text extraction from any PDF document.
                </p>
              </motion.div>
            </div>

            {/* Upload Container */}
            <section className="mb-20">
              <FileUpload onFilesSelect={handleFilesSelect} isQueueLoading={isExtracting} />
              
              {/* Queue View */}
              <AnimatePresence>
                {batchQueue.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="max-w-3xl mx-auto mt-6"
                  >
                    <div className="flex items-center justify-between mb-3 px-2">
                      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                        <Layers size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] dark:text-white/60">Processing Queue ({batchQueue.filter(i => i.status === 'done').length}/{batchQueue.length})</span>
                      </div>
                      <button onClick={clearQueue} className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">Clear All</button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                      {batchQueue.map((item) => (
                        <div 
                          key={item.id} 
                          onClick={() => item.text && setExtractedText(item.text)}
                          className={`flex-shrink-0 min-w-[200px] p-3 rounded-xl border transition-all cursor-pointer ${
                            item.status === 'processing' ? 'bg-black dark:bg-white border-black dark:border-white text-white dark:text-black shadow-lg shadow-black/10' :
                            item.status === 'done' ? 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 shadow-sm hover:border-slate-300 dark:hover:border-white/20' :
                            'bg-slate-50 dark:bg-white/[0.02] border-transparent text-slate-400 dark:text-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.status === 'processing' ? 'bg-white/10 dark:bg-black/10' : 'bg-red-50 dark:bg-red-500/10 text-red-500'}`}>
                              {item.status === 'processing' ? (
                                <div className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ${isDarkMode ? 'border-black' : 'border-white'}`} />
                              ) : (
                                item.type?.includes('image') ? <ImageIcon size={14} /> : <FileText size={14} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold truncate leading-tight transition-colors">{item.name}</p>
                              <p className={`text-[9px] uppercase tracking-wider font-bold ${item.status === 'processing' ? (isDarkMode ? 'text-black/50' : 'text-white/50') : 'text-slate-300 dark:text-slate-700'}`}>{item.status}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </>
        )}

        {/* Results Area */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium mb-8 flex items-center gap-3"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {error}
            </motion.div>
          )}

          {extractedText !== null && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto bg-white dark:bg-[#161920] rounded-3xl border border-slate-200 dark:border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden"
            >
              {/* Toolbar */}
              <div className="border-b border-slate-100 dark:border-white/5 p-4 px-6 flex items-center justify-between bg-slate-50/30 dark:bg-white/[0.02]">
                <div className="flex items-center gap-6">
                  <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                    <button 
                      onClick={() => setActiveTab('raw')}
                      className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'raw' ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500'}`}
                    >
                      Raw Text
                    </button>
                    <button 
                      onClick={() => setActiveTab('processed')}
                      disabled={!processedText && !isProcessing}
                      className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'processed' ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 disabled:opacity-30'}`}
                    >
                      AI Refinement
                    </button>
                  </div>
                  
                  <div className="hidden lg:flex items-center gap-4 border-l border-slate-200 dark:border-white/10 pl-6">
                    <button 
                      onClick={() => handleSmartAction('summarize')}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <ListFilter size={14} />
                      Summarize
                    </button>
                    <button 
                      onClick={() => handleSmartAction('insights')}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <Zap size={14} />
                      Insights
                    </button>
                    <button 
                      onClick={() => handleSmartAction('table')}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <TableIcon size={14} />
                      Table
                    </button>
                    <button 
                      onClick={() => handleSmartAction('translate')}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <Languages size={14} />
                      Translate
                    </button>
                    <button 
                      onClick={() => setIsSplitView(!isSplitView)}
                      className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${isSplitView ? 'text-black dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white'}`}
                    >
                      <Split size={14} />
                      Split View
                    </button>
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${isEditing ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white'}`}
                    >
                      {isEditing ? <Save size={14} /> : <Edit3 size={14} />}
                      {isEditing ? 'Finish' : 'Edit'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden xl:flex items-center gap-2 mr-4 bg-slate-100 dark:bg-white/5 p-1 px-2 rounded-xl border border-slate-200 dark:border-white/5">
                    <MessageSquare size={14} className="text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Ask document..."
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSmartAction('custom')}
                      className="bg-transparent border-none focus:ring-0 text-[11px] font-medium w-40 placeholder:text-slate-400"
                    />
                    <button 
                      onClick={() => handleSmartAction('custom')}
                      disabled={isProcessing || !aiQuery.trim()}
                      className="p-1 hover:text-black dark:hover:text-white disabled:opacity-30"
                    >
                      <Zap size={14} fill={aiQuery.trim() ? "currentColor" : "none"} className={aiQuery.trim() ? "text-amber-500" : ""} />
                    </button>
                  </div>
                  <button
                    onClick={() => setIsFocusMode(!isFocusMode)}
                    className={`p-2 transition-all rounded-xl ${isFocusMode ? 'text-amber-500 bg-amber-500/10' : 'text-slate-300 dark:text-slate-600 hover:text-black dark:hover:text-white'}`}
                    title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
                  >
                    {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                  <button
                    onClick={() => {
                      setExtractedText(null);
                      setProcessedText(null);
                      setViewerSearchQuery('');
                      setIsEditing(false);
                      setIsFocusMode(false);
                    }}
                    className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all mr-2"
                    title="Close Result"
                  >
                    <X size={18} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-black dark:hover:text-white transition-colors p-2 px-3 hover:bg-slate-100/50 dark:hover:bg-white/5 rounded-xl border border-transparent hover:border-slate-100 dark:hover:border-white/5"
                    >
                      <Download size={14} />
                      Export
                    </button>
                    <AnimatePresence>
                      {showExportMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-50 overflow-hidden"
                        >
                          <button 
                            onClick={() => handleDownload('txt')}
                            className="w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-b border-slate-50 dark:border-white/5"
                          >
                            Download as TXT
                          </button>
                          <button 
                            onClick={() => handleDownload('pdf')}
                            className="w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                          >
                            Download as PDF
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white dark:text-black bg-black dark:bg-white transition-all hover:bg-slate-800 dark:hover:bg-slate-200 p-2 px-4 rounded-xl active:scale-95 shadow-lg shadow-black/5"
                  >
                    {copied ? (
                      <><Check size={14} className="text-emerald-400 dark:text-emerald-600" /> Copied</>
                    ) : (
                      <><Copy size={14} /> Copy</>
                    )}
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="relative">
                {/* Internal Search Bar */}
                <div className="absolute top-4 right-8 z-20 flex items-center gap-2 bg-slate-50/80 dark:bg-white/5 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Search size={12} className="text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Find in text..."
                    value={viewerSearchQuery}
                    onChange={(e) => setViewerSearchQuery(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-[10px] font-bold uppercase tracking-widest w-32 placeholder:text-slate-400"
                  />
                  {viewerSearchQuery && (
                    <button onClick={() => setViewerSearchQuery('')} className="text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className={`p-10 min-h-[400px] max-h-[75vh] overflow-y-auto custom-scrollbar ${isSplitView ? 'grid grid-cols-1 lg:grid-cols-2 gap-10' : ''}`}>
                  {activeTab === 'processed' && isProcessing ? (
                    <div className="absolute inset-0 bg-white/80 dark:bg-[#161920]/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-4">
                      <div className="w-12 h-12 border-4 border-slate-100 dark:border-white/5 border-t-black dark:border-t-white rounded-full animate-spin" />
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {currentAction === 'answering' ? 'Gemini is thinking...' : `Gemini is ${currentAction}ing...`}
                      </p>
                    </div>
                  ) : null}
                  
                  {isSplitView ? (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Raw Source</span>
                        </div>
                        <div className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:tracking-tight prose-pre:bg-slate-900 dark:prose-pre:bg-black/40 prose-pre:text-white prose-img:rounded-2xl opacity-60">
                          <ReactMarkdown>{extractedText || ''}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="space-y-6 lg:border-l lg:border-slate-100 lg:dark:border-white/5 lg:pl-10">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-2">
                            <Sparkles size={12} /> AI Refinement
                          </span>
                        </div>
                        
                        {/* Quick Action Pills inside Split View for context */}
                        <div className="flex flex-wrap gap-2 py-2">
                          {QUICK_PROMPTS.map(prompt => (
                            <button
                              key={prompt}
                              onClick={() => {
                                setAiQuery(prompt);
                                handleSmartAction('custom');
                              }}
                              disabled={isProcessing}
                              className="px-3 py-1 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-full text-[9px] font-bold text-slate-400 hover:text-black dark:hover:text-white hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>

                        <div className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:tracking-tight prose-pre:bg-slate-900 dark:prose-pre:bg-black/40 prose-pre:text-white prose-img:rounded-2xl">
                          <ReactMarkdown>{processedText || '_No refinement yet_'}</ReactMarkdown>
                        </div>
                      </div>
                    </>
                  ) : isEditing ? (
                    <textarea
                      value={activeTab === 'raw' ? (extractedText || '') : (processedText || '')}
                      onChange={handleTextChange}
                      className="w-full h-[400px] bg-transparent text-slate-900 dark:text-[#E2E8F0] border-none focus:ring-0 resize-none font-mono text-sm leading-relaxed"
                      placeholder="Edit extracted text..."
                    />
                  ) : (
                    <div className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:tracking-tight prose-pre:bg-slate-900 dark:prose-pre:bg-black/40 prose-pre:text-white prose-img:rounded-2xl">
                      <ReactMarkdown>
                        {activeTab === 'raw' ? (extractedText || '_No text extracted_') : (processedText || '_Run an AI action to see refined results_')}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Info Bar */}
                <div className="border-t border-slate-50 dark:border-white/5 p-3 px-8 flex items-center justify-between bg-slate-50/20 dark:bg-white/[0.01] text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
                  <div className="flex gap-6">
                    <span className="flex items-center gap-2"><Type size={12} /> {stats.words} Words</span>
                    <span className="flex items-center gap-2"><ListFilter size={12} /> {stats.chars} Characters</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    Secure Local Session
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Features / Statistics UI from design */}
        {!extractedText && !isExtracting && (
          <div className="max-w-3xl mx-auto">
             <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-slate-400 dark:text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Recent Extractions</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
                  <input 
                    type="text"
                    placeholder="Search history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black/5 dark:focus:ring-white/5 transition-all w-48 group-hover:w-64"
                  />
                </div>
                {selectedHistoryIds.length > 0 ? (
                  <button 
                    onClick={deleteSelectedHistory}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                  >
                    <Trash2 size={14} />
                    Delete {selectedHistoryIds.length}
                  </button>
                ) : (
                  history.length > 0 && (
                    <button 
                      onClick={clearHistory}
                      className="p-2 text-slate-300 dark:text-slate-700 hover:text-red-500 transition-colors"
                      title="Clear All History"
                    >
                      <Trash2 size={16} />
                    </button>
                  )
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((item) => (
                  <motion.div 
                    layout
                    key={item.id} 
                    onClick={() => setExtractedText(item.text)}
                    className={`flex items-start gap-4 p-5 bg-white dark:bg-white/5 border rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:shadow-none cursor-pointer hover:shadow-xl transition-all group relative overflow-hidden ${selectedHistoryIds.includes(item.id) ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/5' : 'border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'}`}
                  >
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.text);
                        }}
                        className="p-2 bg-slate-900 dark:bg-white text-white dark:text-black text-[8px] font-bold rounded-bl-xl uppercase tracking-tighter hover:scale-105 transition-transform mr-1"
                      >
                        Copy
                      </button>
                      <div className="p-1 px-2 bg-slate-900 dark:bg-white text-white dark:text-black text-[8px] font-bold rounded-bl-xl uppercase tracking-tighter">Open</div>
                    </div>

                    <button 
                      onClick={(e) => toggleHistorySelection(item.id, e)}
                      className={`absolute top-4 left-4 z-10 p-1 rounded-md transition-all ${selectedHistoryIds.includes(item.id) ? 'text-amber-500 opacity-100' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}
                    >
                      {selectedHistoryIds.includes(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>

                    <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 group-hover:rotate-6 transition-transform flex-shrink-0">
                      <FileText size={24} />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-[14px] font-bold truncate text-slate-900 dark:text-[#E2E8F0] mb-0.5">{item.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2">{item.size} • {formatTime(item.timestamp)}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-600 line-clamp-2 leading-relaxed h-[34px]">
                        {item.text.substring(0, 150)}...
                      </p>
                    </div>
                    <button 
                      onClick={(e) => deleteHistory(item.id, e)}
                      className="absolute bottom-4 right-4 p-2 text-slate-300 dark:text-slate-700 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-full text-center py-32 bg-gray-50/10 dark:bg-white/[0.01] border-2 border-dashed border-slate-100 dark:border-white/5 rounded-[40px] flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                    <History size={24} className="text-slate-300 dark:text-slate-700" />
                  </div>
                  <div className="max-w-xs">
                    <p className="text-slate-900 dark:text-white text-sm font-bold uppercase tracking-widest mb-1">
                      {searchQuery ? 'No documents found' : 'Your Workspace is Empty'}
                    </p>
                    <p className="text-slate-400 dark:text-slate-600 text-xs font-medium leading-relaxed">
                      {searchQuery ? `We couldn't find anything matching "${searchQuery}"` : 'Upload a PDF or image to start extracting structured intelligence.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-16 py-10 flex flex-col md:flex-row justify-between items-center text-[11px] font-medium text-slate-400 tracking-wider uppercase">
        <div className="flex gap-8">
          <a href="#" className="hover:text-black transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-black transition-colors">Terms of Service</a>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span>Cloud OCR Engine v4.2 Online</span>
        </div>
      </footer>
    </div>
  );
}


