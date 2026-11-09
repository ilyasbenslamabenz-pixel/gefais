import { useEffect } from 'react';
import { useStore } from './store';
import { connect } from './net/socket';
import { MainMenu } from './ui/Menu';
import { GameScene } from './game/GameScene';
import { HUD } from './ui/HUD';
import { Controls } from './ui/Controls';
import { Panels } from './ui/Panels';
import { Toasts } from './ui/common';
import { TouchControls } from './ui/Touch';

function Game() {
  return (
    <div id="game-root">
      <GameScene />
      <Controls />
      <HUD />
      <TouchControls />
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  useEffect(() => connect(), []);
  return (
    <>
      {screen === 'menu' ? <MainMenu /> : <Game />}
      <Panels />
      <Toasts />
    </>
  );
}
