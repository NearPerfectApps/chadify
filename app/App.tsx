import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import CameraScreen from './screens/CameraScreen';
import ResultScreen from './screens/ResultScreen';

type Screen = 'camera' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('camera');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const handlePhotoTaken = (uri: string) => {
    setCapturedUri(uri);
    setScreen('result');
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setScreen('camera');
  };

  return (
    <>
      <StatusBar style="light" />
      {screen === 'camera' ? (
        <CameraScreen onPhotoTaken={handlePhotoTaken} />
      ) : (
        <ResultScreen userPhotoUri={capturedUri!} onRetake={handleRetake} />
      )}
    </>
  );
}
