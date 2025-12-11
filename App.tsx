import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileImage, Send, Loader2, BookOpen, Brain, CheckCircle2, AlertTriangle, AlertCircle, History, ArrowLeft, Clock, Calendar, Trash2, MessageSquare, PlayCircle, User, Bot } from 'lucide-react';
import AudioRecorder from './components/AudioRecorder';
import { analyzeHomework, evaluatePracticeResponse } from './services/geminiService';
import { InitialDiagnosis, HistoryItem, ChatMessage } from './types';
import { saveToHistory, getHistory, clearHistory } from './services/historyService';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const App: React.FC = () => {
  // Analysis State
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  // Stage 1 Result
  const [diagnosis, setDiagnosis] = useState<InitialDiagnosis | null>(null);

  // Stage 2 Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replyAudio, setReplyAudio] = useState<Blob | null>(null);
  const [isMasteryAchieved, setIsMasteryAchieved] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // Scroll to chat bottom
  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, diagnosis]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Invalid file format. Please upload a JPG, PNG, or WebP image.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please upload a smaller image.`;
    }
    return null;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        e.target.value = ''; 
        return;
      }

      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      // Reset all states
      setDiagnosis(null);
      setChatHistory([]);
      setReplyText('');
      setReplyAudio(null);
      setIsMasteryAchieved(false);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setDiagnosis(null);
      setChatHistory([]);
      setReplyText('');
      setReplyAudio(null);
      setIsMasteryAchieved(false);
      setError(null);
    }
  };

  // STAGE 1: Initial Diagnosis
  const handleInitialAnalysis = async () => {
    if (!image) {
      setError("Please upload an image of your homework first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await analyzeHomework(image, textInput, audioBlob);
      setDiagnosis(data);
      
      // Initialize chat with Tutor's first instruction
      setChatHistory([{
        role: 'tutor',
        content: data.next_instruction,
        timestamp: Date.now(),
        feedbackType: 'INFO'
      }]);
      
      // Save to history
      saveToHistory(data, textInput);
      setHistory(getHistory());
      
      // Clear initial inputs
      setReplyText('');
      setReplyAudio(null);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // STAGE 2: Conversational Feedback
  const handlePracticeReply = async () => {
    if ((!replyText && !replyAudio) || !diagnosis) return;

    // 1. Optimistic Update: Add User Message
    const userMsg: ChatMessage = {
        role: 'user',
        content: replyText || "(Audio Response)",
        timestamp: Date.now()
    };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setReplyText('');
    setReplyAudio(null);
    setIsLoading(true);

    try {
        const feedback = await evaluatePracticeResponse(
            { topic: diagnosis.new_practice_question.topic, question: diagnosis.new_practice_question.question_text },
            updatedHistory,
            userMsg.content,
            replyAudio
        );

        // 2. Add Tutor Response
        const tutorMsg: ChatMessage = {
            role: 'tutor',
            content: `${feedback.feedback_message} ${feedback.next_instruction}`,
            timestamp: Date.now(),
            feedbackType: feedback.evaluation_result as any
        };
        setChatHistory(prev => [...prev, tutorMsg]);

        if (feedback.dialogue_action === 'MASTERY_ACHIEVED') {
            setIsMasteryAchieved(true);
        }

    } catch (err: any) {
        setError(err.message || "Failed to get feedback.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setDiagnosis(item);
    setShowHistory(false);
    
    // Restore basic chat state
    setChatHistory([{
        role: 'tutor',
        content: item.next_instruction,
        timestamp: item.timestamp,
        feedbackType: 'INFO'
    }]);
    
    // Clear others
    setImage(null);
    setPreviewUrl(null);
    setAudioBlob(null);
    setReplyText('');
    setReplyAudio(null);
    setError(null);
    setIsMasteryAchieved(false);
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear all history?")) {
      clearHistory();
      setHistory([]);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowHistory(false)}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              O
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">
              Omni-Tutor
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showHistory 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
             >
               {showHistory ? <ArrowLeft size={18} /> : <History size={18} />}
               {showHistory ? "Back to Tutor" : "History"}
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {showHistory ? (
          // HISTORY VIEW
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-6 h-6 text-slate-400" />
                Learning History
              </h2>
              {history.length > 0 && (
                <button 
                  onClick={handleClearHistory}
                  className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1.5 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                  Clear History
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200 border-dashed">
                <History className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No history yet</p>
                <p className="text-sm">Upload homework to start your learning journey.</p>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="mt-6 text-blue-600 font-semibold hover:underline"
                >
                  Start New Analysis
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleHistorySelect(item)}
                    className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-md">
                        <Calendar size={12} />
                        {formatDate(item.timestamp)}
                      </div>
                      <div className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase rounded-md">
                        {item.new_practice_question.subject || "Topic"}
                      </div>
                    </div>
                    
                    <h3 className="font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">
                      {item.new_practice_question.topic}
                    </h3>
                    
                    <div className="flex items-start gap-2 text-sm text-slate-600 line-clamp-2">
                       <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                       <span className="text-slate-500">{item.conceptual_misunderstanding}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          // MAIN ANALYSIS VIEW
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Input & Preview (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Image Upload Card */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700">
                  <FileImage className="w-5 h-5 text-blue-600" />
                  Original Work
                </h2>
                
                {image || previewUrl ? (
                   <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group">
                      {previewUrl ? (
                        <img src={previewUrl} alt="Homework Preview" className="w-full h-auto max-h-[300px] object-contain" />
                      ) : (
                        <div className="h-48 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                          <FileImage className="w-10 h-10 mb-2 opacity-30" />
                          <p className="text-sm font-medium">Image not preserved</p>
                        </div>
                      )}
                      
                      <button 
                        onClick={() => {
                          setImage(null);
                          setPreviewUrl(null);
                          setDiagnosis(null);
                          setChatHistory([]);
                          fileInputRef.current?.click();
                        }}
                        className="absolute bottom-3 right-3 bg-white/90 hover:bg-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm backdrop-blur-sm transition-colors border border-slate-200 opacity-0 group-hover:opacity-100"
                      >
                        Change
                      </button>
                   </div>
                ) : (
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-slate-50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all h-48"
                  >
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="text-sm font-medium text-slate-600">Upload Homework</p>
                      <p className="text-xs text-slate-400 mt-1">Click or Drag & Drop</p>
                  </div>
                )}
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/jpeg,image/png,image/webp" 
                  className="hidden" 
                />
              </div>

              {/* Initial Diagnosis Result (Visible after Stage 1) */}
              {diagnosis && (
                  <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 shadow-sm animate-fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-amber-900 mb-1 text-sm">Diagnosis</h3>
                        <p className="text-amber-800 text-sm leading-relaxed">
                          {diagnosis.conceptual_misunderstanding}
                        </p>
                        <div className="mt-3 text-xs bg-white/50 p-2 rounded text-amber-900/70 italic border border-amber-100/50">
                            "{diagnosis.tutor_feedback}"
                        </div>
                      </div>
                    </div>
                  </div>
              )}

              {/* Initial Input (Only visible before Stage 1 complete) */}
              {!diagnosis && (
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-700">
                      <Brain className="w-5 h-5 text-purple-600" />
                      Your Thought Process
                    </h2>
                    
                    <div className="space-y-3">
                      <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="I was confused about..."
                        className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-24 text-sm"
                      />
                      <AudioRecorder onAudioReady={setAudioBlob} />
                      
                      <button
                        onClick={handleInitialAnalysis}
                        disabled={isLoading || !image}
                        className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-sm transition-all ${
                          isLoading || !image
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 hover:-translate-y-0.5'
                        }`}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {isLoading ? "Diagnosing..." : "Start Diagnosis"}
                      </button>
                    </div>
                  </div>
              )}
              
               {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 text-sm animate-fade-in border border-red-100">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: Interactive Tutor (8 cols) */}
            <div className="lg:col-span-8 flex flex-col h-[calc(100vh-8rem)]">
              {!diagnosis ? (
                 // Empty State
                 <div className="h-full bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 p-8">
                    <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Omni-Tutor Workspace</p>
                    <p className="text-sm">Upload your homework to start the tutoring session.</p>
                 </div>
              ) : (
                // Active Session State
                <div className="flex flex-col h-full space-y-4">
                    
                    {/* Practice Question Header */}
                    <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 shadow-sm shrink-0">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-500 tracking-wider uppercase mb-2">
                            <span className="bg-white/50 px-2 py-1 rounded">{diagnosis.new_practice_question.subject || "Topic"}</span>
                            <span>•</span>
                            <span>{diagnosis.new_practice_question.topic}</span>
                        </div>
                        <h3 className="text-lg font-bold text-indigo-900 leading-snug">
                            {diagnosis.new_practice_question.question_text}
                        </h3>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'tutor' && (
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                            <Bot size={16} />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-blue-600 text-white rounded-tr-none' 
                                            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                                    }`}>
                                        {/* Tutor Feedback Status Badge */}
                                        {msg.feedbackType && msg.feedbackType !== 'INFO' && (
                                            <div className={`text-xs font-bold uppercase mb-2 inline-block px-2 py-0.5 rounded ${
                                                msg.feedbackType === 'CORRECT' ? 'bg-green-100 text-green-700' : 
                                                msg.feedbackType === 'CALCULATION_ERROR' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                                {msg.feedbackType === 'CORRECT' ? 'Correct' : 
                                                 msg.feedbackType === 'CALCULATION_ERROR' ? 'Calculation Check' : 'Concept Check'}
                                            </div>
                                        )}
                                        <p>{msg.content}</p>
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                                            <User size={16} />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3">
                                     <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                            <Bot size={16} />
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 w-16 flex items-center justify-center">
                                        <div className="flex gap-1">
                                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-200">
                             {isMasteryAchieved ? (
                                 <div className="text-center py-4 bg-green-50 rounded-xl border border-green-100">
                                     <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                     <p className="font-bold text-green-800">Concept Mastered!</p>
                                     <p className="text-sm text-green-600 mb-3">You've successfully completed this practice.</p>
                                     <button 
                                        onClick={() => {
                                            setImage(null);
                                            setPreviewUrl(null);
                                            setDiagnosis(null);
                                            setChatHistory([]);
                                            fileInputRef.current?.click();
                                        }}
                                        className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                                     >
                                         Upload New Homework
                                     </button>
                                 </div>
                             ) : (
                                <div className="flex flex-col gap-3">
                                    <textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if(e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handlePracticeReply();
                                            }
                                        }}
                                        placeholder="Type your next step here..."
                                        className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-20 text-sm"
                                    />
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 max-w-[200px]">
                                             <AudioRecorder onAudioReady={setReplyAudio} />
                                        </div>
                                        <button
                                            onClick={handlePracticeReply}
                                            disabled={isLoading || (!replyText && !replyAudio)}
                                            className={`px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-sm transition-all ${
                                                isLoading || (!replyText && !replyAudio)
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                : 'bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-0.5'
                                            }`}
                                        >
                                            <Send size={18} />
                                            <span>Reply</span>
                                        </button>
                                    </div>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;