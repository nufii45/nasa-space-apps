import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { Video } from './Video.jsx';

const Root = () => (
  <Composition id="OutpostDial" component={Video} durationInFrames={900} fps={30} width={1920} height={1080} />
);

registerRoot(Root);
