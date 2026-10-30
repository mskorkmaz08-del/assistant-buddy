// Draws a buddy as an SVG string.
// kind: bear | panda | cat. mood: neutral | happy | dancing | sad | study (reading a book).
// costume: none | bow | dress | dino-green | dino-pink.
// Head, body, eyes and arm are separate groups so buddy.css can move them on their own.
(function (root) {
  const INK = '#4A2B22';
  const FUR = { bear: '#D3A283', panda: '#FFFFFF', cat: '#FFFFFF' };
  const DINO = {
    'dino-green': { suit: '#8CC46B', dark: '#5E9446', spike: '#C9E6A8' },
    'dino-pink': { suit: '#F7A7A0', dark: '#D86A62', spike: '#FFD2CC' }
  };
  const HEAD = 'M100 26 C154 26 184 60 184 100 C184 138 150 160 100 160 C50 160 16 138 16 100 C16 60 46 26 100 26 Z';
  const BODY = 'M46 128 C38 165 36 198 48 211 C54 218 68 219 80 218 C91 217 97 213 100 206 C103 213 109 217 120 218 C132 219 146 218 152 211 C164 198 162 165 154 128 Z';

  function buddySVG(opts) {
    const kind = opts.kind || 'bear';
    const mood = opts.mood || 'neutral';
    const costume = opts.costume || 'none';
    const fur = opts.color || FUR[kind] || FUR.bear;
    const dino = DINO[costume];
    const suit = dino ? dino.suit : fur; // body colour (the dino suit covers the body)
    const cheek = kind === 'bear' ? '#F6BF78' : '#F8B5BC';
    const dance = mood === 'dancing';
    const sad = mood === 'sad';
    const study = mood === 'study';
    const paw = dino ? dino.dark : (kind === 'panda' ? INK : fur);

    const line = (d, w, c) => '<path d="' + d + '" fill="none" stroke="' + (c || INK) + '" stroke-width="' + (w || 6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    // chubby limb: dark tube with a coloured tube inside, so it reads as an outlined arm
    const arm = (d, w) => line(d, w || 30) + '<path d="' + d + '" fill="none" stroke="' + suit + '" stroke-width="' + ((w || 30) - 14) + '" stroke-linecap="round"/>';
    const eye = (x, y) => '<ellipse cx="' + x + '" cy="' + y + '" rx="8" ry="8.5" fill="' + INK + '"/><circle cx="' + (x + 2.5) + '" cy="' + (y - 3) + '" r="2.2" fill="#FFFFFF"/>';

    // ears (hidden under a dino hood)
    let ears = '';
    if (!dino) {
      if (kind === 'bear') {
        ears += '<circle cx="40" cy="46" r="25" fill="' + fur + '" stroke="' + INK + '" stroke-width="8"/>';
        ears += '<circle cx="160" cy="46" r="25" fill="' + fur + '" stroke="' + INK + '" stroke-width="8"/>';
        ears += '<circle cx="44" cy="50" r="12" fill="#9A6346"/><circle cx="156" cy="50" r="12" fill="#9A6346"/>';
      } else if (kind === 'panda') {
        ears += '<circle cx="42" cy="44" r="23" fill="' + INK + '" stroke="' + INK + '" stroke-width="8"/>';
        ears += '<circle cx="158" cy="44" r="23" fill="' + INK + '" stroke="' + INK + '" stroke-width="8"/>';
      } else {
        ears += '<path d="M30 78 Q24 26 44 20 Q60 22 82 38 Z" fill="' + fur + '" stroke="' + INK + '" stroke-width="8" stroke-linejoin="round"/>';
        ears += '<path d="M170 78 Q176 26 156 20 Q140 22 118 38 Z" fill="' + fur + '" stroke="' + INK + '" stroke-width="8" stroke-linejoin="round"/>';
        ears += '<path d="M40 56 Q38 34 47 31 Q56 33 66 40 Z" fill="#F8B5BC"/><path d="M160 56 Q162 34 153 31 Q144 33 134 40 Z" fill="#F8B5BC"/>';
      }
    }

    // face
    let face = '';
    if (mood === 'neutral') {
      face += '<g class="bb-eyes">' + eye(64, 104) + eye(136, 104) + '</g>';
      face += line('M90 108 Q95 114 100 108 Q105 114 110 108', 4.5);
    } else if (study) {
      // eyes looking down at the book
      face += '<g class="bb-eyes"><ellipse cx="64" cy="108" rx="7.5" ry="7" fill="' + INK + '"/><ellipse cx="136" cy="108" rx="7.5" ry="7" fill="' + INK + '"/><circle cx="66" cy="105" r="2" fill="#FFFFFF"/><circle cx="138" cy="105" r="2" fill="#FFFFFF"/></g>';
      face += line('M93 118 Q100 123 107 118', 4);
    } else if (mood === 'happy' || dance) {
      face += line('M54 106 Q64 94 74 106') + line('M126 106 Q136 94 146 106');
      face += '<path d="M89 107 Q94.5 113 100 107 Q105.5 113 111 107 Q110 126 100 126 Q90 126 89 107 Z" fill="#E86F7C" stroke="' + INK + '" stroke-width="4.5" stroke-linejoin="round"/>';
    } else {
      // worried and teary, like the sad reference reels
      const teary = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="10" fill="' + INK + '"/>' +
        '<circle cx="' + (x + 3) + '" cy="' + (y - 4) + '" r="3.6" fill="#FFFFFF"/><circle cx="' + (x - 3.5) + '" cy="' + (y + 3) + '" r="2" fill="#FFFFFF"/>';
      face += '<g class="bb-eyes">' + teary(64, 108) + teary(136, 108) + '</g>';
      face += line('M56 93 Q62 88 71 87', 4) + line('M144 93 Q138 88 129 87', 4);
      face += line('M92 120 Q96 116 100 120 Q104 124 108 120', 4);
      face += '<g class="bb-tear">' + line('M52 120 Q64 127 76 120', 5, '#7CC8EE') + line('M124 120 Q136 127 148 120', 5, '#7CC8EE') + '</g>';
    }
    const cheeks = '<ellipse cx="42" cy="120" rx="19" ry="14" fill="' + cheek + '" opacity="' + (sad ? 0.5 : 1) + '"/>' +
      '<ellipse cx="158" cy="120" rx="19" ry="14" fill="' + cheek + '" opacity="' + (sad ? 0.5 : 1) + '"/>';

    let s = '<svg class="buddy mood-' + mood + '" xmlns="http://www.w3.org/2000/svg" viewBox="-6 -10 212 240" width="' + (opts.size || 200) + '" height="' + Math.round((opts.size || 200) * 240 / 212) + '" role="img" aria-label="' + (opts.label || (kind + ', ' + mood)) + '">';
    s += '<ellipse class="bb-shadow" cx="100" cy="221" rx="62" ry="7" fill="' + INK + '" opacity="0.08"/>';
    s += '<g class="bb-body">';

    // tails sit behind everything
    if (dino) {
      s += '<g class="bb-tail"><path d="M146 196 Q188 206 200 176 Q192 186 160 176 Z" fill="' + dino.suit + '" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>';
      s += '<path d="M168 190 l6 -12 l6 10 M182 186 l5 -11 l5 8" fill="' + dino.spike + '" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>';
    } else if (kind === 'cat') {
      s += '<g class="bb-tail">' + line('M154 204 Q192 204 186 166 Q184 154 174 158', 18) + line('M154 204 Q192 204 186 166 Q184 154 174 158', 8, fur) + '</g>';
    }

    // one outline around head + body: thick strokes first, then fills on top hide the inner seam
    s += '<path d="' + BODY + '" fill="' + suit + '" stroke="' + INK + '" stroke-width="16" stroke-linejoin="round"/>';
    s += '<g class="bb-head">' + ears + '<path d="' + HEAD + '" fill="' + fur + '" stroke="' + INK + '" stroke-width="16"/></g>';
    s += '<path d="' + BODY + '" fill="' + suit + '"/>';

    // outfit details on the body
    if (dino) {
      s += '<path d="M72 160 Q100 150 128 160 Q132 196 116 210 L84 210 Q68 196 72 160 Z" fill="#FBE28A"/>';
      s += line('M78 176 Q100 172 122 176', 3, '#E2B94E') + line('M76 192 Q100 188 124 192', 3, '#E2B94E');
    } else if (costume === 'dress') {
      s += '<path d="M54 150 Q100 140 146 150 L160 204 Q150 214 140 206 Q130 216 120 206 Q110 216 100 206 Q90 216 80 206 Q70 216 60 206 Q50 214 40 204 Z" fill="#F7B6CB" stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"/>';
      s += '<circle cx="78" cy="180" r="4" fill="#FFFFFF"/><circle cx="104" cy="190" r="4" fill="#FFFFFF"/><circle cx="126" cy="174" r="4" fill="#FFFFFF"/><circle cx="92" cy="166" r="3" fill="#FFFFFF"/><circle cx="136" cy="194" r="3" fill="#FFFFFF"/>';
    }
    if ((dino || costume === 'dress' || kind === 'panda') && !sad) {
      // little paws peeking out at the bottom
      s += '<ellipse cx="74" cy="214" rx="17" ry="8" fill="' + paw + '"/><ellipse cx="126" cy="214" rx="17" ry="8" fill="' + paw + '"/>';
    }

    // arms
    if (dance) {
      s += '<g class="bb-wave">' + arm('M142 156 Q170 150 184 130', 34) + '</g>';
    } else if (!sad && !study) {
      s += arm('M60 152 Q54 166 64 178', 32) + arm('M140 152 Q146 166 136 178', 32);
    }
    if (sad) {
      s += '<ellipse cx="50" cy="210" rx="20" ry="12" transform="rotate(-20 50 210)" fill="' + paw + '" stroke="' + INK + '" stroke-width="6"/>';
      s += '<ellipse cx="150" cy="210" rx="20" ry="12" transform="rotate(20 150 210)" fill="' + paw + '" stroke="' + INK + '" stroke-width="6"/>';
    }

    // head front: face, then hood or accessories over it
    s += '<g class="bb-head"><path d="' + HEAD + '" fill="' + fur + '"/>' + cheeks + face;
    if (dino) {
      // hood with an open mouth around the face, teeth, dino eyes and spikes
      s += '<path fill-rule="evenodd" d="M100 -2 C164 -2 198 40 198 96 C198 140 182 160 168 166 L32 166 C18 160 2 140 2 96 C2 40 36 -2 100 -2 Z M100 70 C146 70 170 92 170 120 C170 146 140 160 100 160 C60 160 30 146 30 120 C30 92 54 70 100 70 Z" fill="' + dino.suit + '" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>';
      let teeth = '';
      for (let i = 0; i < 7; i++) {
        const x = 56 + i * 15;
        const y = 76 + Math.abs(i - 3) * 2.6;
        teeth += 'M' + x + ' ' + y + ' l7 12 l7 -12 ';
      }
      s += '<path d="' + teeth + '" fill="#FFFFFF" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
      s += '<g class="bb-dino-eyes"><circle cx="66" cy="30" r="12" fill="#FFFFFF" stroke="' + INK + '" stroke-width="4"/><circle cx="68" cy="31" r="6" fill="' + INK + '"/>';
      s += '<circle cx="114" cy="24" r="12" fill="#FFFFFF" stroke="' + INK + '" stroke-width="4"/><circle cx="116" cy="25" r="6" fill="' + INK + '"/></g>';
      s += '<path d="M148 10 l14 -6 l-2 16 M170 28 l16 -2 l-8 14 M184 54 l14 4 l-12 10" fill="' + dino.spike + '" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>';
      s += '<ellipse cx="42" cy="52" rx="9" ry="6" fill="#FFFFFF" opacity="0.5"/>';
    } else if (costume === 'bow' || costume === 'dress') {
      s += '<g class="bb-bow" transform="translate(150 30) rotate(18)"><path d="M0 0 C-10 -18 -34 -14 -30 4 C-28 18 -10 12 0 0 Z M0 0 C10 -18 34 -14 30 4 C28 18 10 12 0 0 Z" fill="#F1648E" stroke="' + INK + '" stroke-width="4.5" stroke-linejoin="round"/>';
      s += '<circle cx="0" cy="0" r="7" fill="#F1648E" stroke="' + INK + '" stroke-width="4.5"/></g>';
    }
    s += '</g>';

    if (study) {
      // arms come forward and the paws hold an open book on the lap
      s += arm('M62 160 Q58 174 62 182', 26) + arm('M138 160 Q142 174 138 182', 26);
      s += '<g class="bb-book">';
      s += '<path d="M46 170 L100 180 L154 170 L154 212 L100 222 L46 212 Z" fill="#B83E62" stroke="' + INK + '" stroke-width="5" stroke-linejoin="round"/>';
      s += '<path d="M52 166 Q78 162 100 176 L100 214 Q78 202 52 206 Z" fill="#FFFDF8" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>';
      s += '<path d="M148 166 Q122 162 100 176 L100 214 Q122 202 148 206 Z" fill="#FFFDF8" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>';
      s += line('M60 178 Q76 176 92 184 M60 188 Q76 186 92 194', 2.5, '#C9B8AE') + line('M140 178 Q124 176 108 184 M140 188 Q124 186 108 194', 2.5, '#C9B8AE');
      s += '<path class="bb-page" d="M100 176 Q122 162 146 166 L146 206 Q122 202 100 214 Z" fill="#FFF6EA" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
      s += '</g>';
      s += '<ellipse cx="60" cy="186" rx="12" ry="12" fill="' + paw + '" stroke="' + INK + '" stroke-width="5"/>';
      s += '<ellipse cx="140" cy="186" rx="12" ry="12" fill="' + paw + '" stroke="' + INK + '" stroke-width="5"/>';
    }
    if (sad) {
      // arms curl in and the paws hold each other under the chin
      s += arm('M54 152 Q56 176 84 176') + arm('M146 152 Q144 176 116 176');
      s += '<ellipse cx="91" cy="174" rx="13" ry="12" fill="' + paw + '" stroke="' + INK + '" stroke-width="5"/>';
      s += '<ellipse cx="109" cy="174" rx="13" ry="12" fill="' + paw + '" stroke="' + INK + '" stroke-width="5"/>';
    }
    if (dance) {
      s += '<g class="bb-mic"><path d="M78 152 L100 152 L92 194 L86 194 Z" fill="' + INK + '" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
      s += '<circle cx="89" cy="142" r="16" fill="#5EB9EE" stroke="' + INK + '" stroke-width="5"/>';
      s += '<ellipse cx="90" cy="176" rx="18" ry="14" fill="' + paw + '" stroke="' + INK + '" stroke-width="6"/></g>';
    }
    s += '</g>';
    if (dance) {
      s += '<text class="bb-note n1" x="-2" y="40" font-size="30" fill="#E0588A">♪</text><text class="bb-note n2" x="178" y="30" font-size="26" fill="#7A63C9">♫</text>';
    }
    s += '</svg>';
    return s;
  }

  const api = { buddySVG: buddySVG };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Buddy = api;
})(this);
