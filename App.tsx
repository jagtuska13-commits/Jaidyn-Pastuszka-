import React, { useState } from 'react';
import IntroAnimation from './components/IntroAnimation';
import ChatInterface from './components/ChatInterface';
import { AppState } from './types';
import { AnimatePresence, motion } from 'framer-motion';

function App() {
  // Start with INTRO, switch to ACTIVE when animation completes
  const [appState, setAppState] = useState<AppState>(AppState.INTRO);

  const handleIntroComplete = () => {
    setAppState(AppState.ACTIVE);
  };

  return (
    <AnimatePresence mode="wait">
      {appState === AppState.INTRO && (
        <motion.div
          key="intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 w-full h-full"
        >
          <IntroAnimation onComplete={handleIntroComplete} />
        </motion.div>
      )}
      
      {appState === AppState.ACTIVE && (
        <motion.div
          key="chat"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="w-full h-full"
        >
          <ChatInterface />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
