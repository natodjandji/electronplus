import {
  ChatChannelsService,
  splitText,
  stripWhatsappFormatting,
  templateParam,
} from './chat-channels.service';

describe('ChatChannelsService — WhatsApp recipients', () => {
  const service = new ChatChannelsService({
    get: (key: string) =>
      ({
        META_GRAPH_VERSION: 'v25.0',
        META_ACCESS_TOKEN: 'token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
      })[key],
  } as never);
  let fetchMock: jest.SpyInstance;
  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string) as object;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.out' }] })),
      );
  });
  afterEach(() => fetchMock.mockRestore());

  it('sends to a number in `to`', async () => {
    expect(await service.sendText('whatsapp', '584141234567', 'Hola')).toEqual(['wamid.out']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/123/messages');
    expect(sentBody()).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '584141234567',
      type: 'text',
      text: { body: 'Hola', preview_url: true },
    });
  });

  it('sends to a BSUID in `recipient`, without `to`', async () => {
    expect(await service.sendText('whatsapp', 'VE.13491208655302741918', 'Hola')).toEqual([
      'wamid.out',
    ]);
    expect(sentBody()).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      recipient: 'VE.13491208655302741918',
      type: 'text',
      text: { body: 'Hola', preview_url: true },
    });
  });

  it('sends product cards to a BSUID too', async () => {
    await service.sendProducts('whatsapp', 'VE.13491208655302741918', [
      { title: 'Bombillo', details: 'Ref. 2', url: 'https://x/p' },
    ]);
    expect(sentBody()).toEqual(
      expect.objectContaining({ recipient: 'VE.13491208655302741918', type: 'interactive' }),
    );
    expect(sentBody()).not.toHaveProperty('to');
  });
});

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

describe('templateParam', () => {
  it('puts the text on one line, as Meta requires of a template parameter', () => {
    expect(templateParam('Uno\n\ndos\t   tres     cuatro', 100)).toBe('Uno dos tres cuatro');
  });

  it('cuts it to the limit and never sends it empty', () => {
    expect(templateParam('abcdefghij', 5)).toBe('abcd…');
    expect(templateParam('  \n ', 5)).toBe('—');
  });
});
