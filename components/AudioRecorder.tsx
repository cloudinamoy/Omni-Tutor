import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

interface AudioRecorderProps {
  onAudioReady: (blob: Blob | null) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioReady }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' }); // Use webm for browser compatibility
        onAudioReady(blob);
        setHasRecording(true);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const deleteRecording = () => {
    onAudioReady(null);
    setHasRecording(false);
    setDuration(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (hasRecording) {
    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
        <div className="flex-1 text-sm text-green-700 font-medium">
          Audio Recorded ({formatTime(duration)})
        </div>
        <button
          onClick={deleteRecording}
          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="Delete Recording"
        >
          <Trash2 size={18} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`flex items-center justify-center gap-2 w-full p-3 rounded-lg border transition-all duration-200 ${
        isRecording 
          ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' 
          : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-500'
      }`}
    >
      {isRecording ? (
        <>
          <Square size={18} fill="currentColor" />
          <span className="font-medium">Stop Recording ({formatTime(duration)})</span>
        </>
      ) : (
        <>
          <Mic size={18} />
          <span className="font-medium">Explain via Voice</span>
        </>
      )}
    </button>
  );
};

export default AudioRecorder;
