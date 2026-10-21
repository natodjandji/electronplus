import { splitText, stripWhatsappFormatting } from './chat-channels.service';

describe('splitText', () => {
  it('keeps a short text whole', () => {
    expect(splitText('  Hola  ', 1000)).toEqual(['Hola']);
  });

  it('cuts long texts at paragraph breaks, then at spaces', () => {
    const text = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}`;
    expect(splitText(text, 40)).toEqual(['a'.repeat(30), 'b'.repeat(30)]);
    expect(splitText('uno dos tres cuatro', 9)).toEqual(['uno dos', 'tres', 'cuatro']);
  });

  it('hard-cuts a word longer than the limit', () => {
    expect(splitText('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('stripWhatsappFormatting', () => {
  it('drops bold and italic markers for Instagram, leaving other asterisks', () => {
    expect(stripWhatsappFormatting('El *Bombillo 9W* está _disponible_')).toBe(
      'El Bombillo 9W está disponible',
    );
    expect(stripWhatsappFormatting('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
});
