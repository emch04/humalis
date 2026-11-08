import { useState } from 'react';

export default function Salut({ nom }: { nom: string }) {
  const [clics, setClics] = useState(0);
  return <button type="button" onClick={() => setClics(clics + 1)}>React {nom} {clics}</button>;
}
