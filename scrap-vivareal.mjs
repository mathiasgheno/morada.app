import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const fields = 'id lat lng bedrooms parkingSlots bathrooms rentValue condominiumValue iptuValue salePrice forRent forSale saleType code displayCode status totalArea acceptPets isFurnished nearSubway city neighborhood condominium images amenities comfortCommodities practicalityCommodities installations address local placesNearby region macroRegion availabilityType allowsCustomOffer displayCustomOfferPreference mainImageUrl shortUrl type suites hasElevator doormanType totalCost homeownersInsuranceValue iptuType condominiumType garages iptuDetails houseVisitStatus specialConditions allowRepublishing youtubeVideoId lastPublishedDate allowDirectOffer promotions rentOnTermination rentOnTerminationPublished terminationDate isPrimaryMarket listings cityId tenantServiceFee tenantServiceFeePercentage rentalGuarantee leadReference relations totalCostWithoutRentalGuarantee totalCostWithoutTenantServiceFee rangeFloor generatedDescription video nearbyEstablishments'.split(' ');
const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const scalar = value => typeof value === 'string' || typeof value === 'number' ? value : null;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function flightRecords(text) {
  const bytes = Buffer.from(text, 'utf8');
  const records = [];
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    if (colon < 0) break;
    if (!/^[\da-f]*$/i.test(bytes.subarray(offset, colon).toString())) break;
    if (bytes[colon + 1] === 84) {
      const comma = bytes.indexOf(44, colon + 2);
      if (comma < 0) break;
      const length = bytes.subarray(colon + 2, comma).toString();
      if (!/^[\da-f]+$/i.test(length)) break;
      offset = comma + 1 + parseInt(length, 16);
      continue;
    }
    const newline = bytes.indexOf(10, colon + 1);
    const end = newline < 0 ? bytes.length : newline;
    try { records.push(JSON.parse(bytes.subarray(colon + 1, end).toString())); } catch {}
    offset = end + 1;
  }
  return records;
}

function objects(root) {
  const result = [];
  const queue = [root];
  while (queue.length && result.length < 100000) {
    const current = queue.pop();
    if (!current || typeof current !== 'object') continue;
    if (!Array.isArray(current)) result.push(current);
    queue.push(...Object.values(current).filter(value => value && typeof value === 'object'));
  }
  return result;
}

export function extractVivaReal(html, inputUrl) {
  const url = new URL(inputUrl);
  if (url.protocol !== 'https:' || !['www.vivareal.com.br', 'vivareal.com.br'].includes(url.hostname)) throw new Error('Informe uma URL HTTPS de anúncio do Viva Real.');
  const match = url.pathname.match(/-id-(\d+)\/?$/);
  if (!match) throw new Error('ID do anúncio não encontrado na URL.');
  const id = match[1];
  const result = Object.fromEntries(fields.map(field => [field, null]));
  result.id = Number(id);
  result.shortUrl = url.href;
  const roots = [];
  let flight = '';
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)/g)) {
    try { const chunk = JSON.parse(match[1]); if (chunk[0] === 1 && typeof chunk[1] === 'string') flight += chunk[1]; } catch {}
  }
  roots.push(...flightRecords(flight));
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json|application\/json|__NEXT_DATA__/i.test(script[1])) continue;
    try { roots.push(JSON.parse(script[2])); }
    catch { try { roots.push(JSON.parse(decode(script[2]))); } catch {} }
  }
  const nodes = roots.flatMap(objects);
  const candidates = nodes.filter(item => String(item.id ?? item.listingId) === id);
  const listing = candidates.find(item => item.prices || item.pricingInfos) || candidates.find(item => item.usableAreas || item.unitTypes || item.address);
  const listingLd = nodes.find(item => /RealEstateListing|Apartment|Residence|House|Product/.test(String(item['@type'])) && (String(item.url || item['@id'] || '').includes(id) || String(item.identifier?.value ?? item.identifier) === id));
  const source = listing || listingLd;
  if (!source) return { property: result, extracted: false, reason: 'Nenhum dado estruturado identificável para este anúncio foi encontrado. Não foram usados os valores do slug da URL.' };
  const estate = source.mainEntity || source.itemOffered || source;
  const address = estate.address || source.address || {};
  const point = address.coordinates || address.point || estate.geo || estate.point || {};
  const features = Array.isArray(estate.amenities) ? {} : estate.amenities || {};
  result.lat = number(point.lat ?? point.latitude);
  result.lng = number(point.lon ?? point.lng ?? point.longitude);
  result.bedrooms = number(features.bedrooms?.[0] ?? (Array.isArray(estate.bedrooms) ? estate.bedrooms[0] : estate.bedrooms ?? estate.numberOfBedrooms));
  result.bathrooms = number(features.bathrooms?.[0] ?? (Array.isArray(estate.bathrooms) ? estate.bathrooms[0] : estate.bathrooms ?? estate.numberOfBathroomsTotal));
  result.parkingSlots = number(features.parkingSpaces?.[0] ?? (Array.isArray(estate.parkingSpaces) ? estate.parkingSpaces[0] : estate.parkingSpaces));
  result.totalArea = number(features.usableAreas?.[0] ?? estate.usableAreas?.[0] ?? estate.floorSize?.value);
  result.suites = number(features.suites?.[0]);
  result.city = scalar(address.city ?? address.addressLocality);
  result.neighborhood = scalar(address.neighborhood ?? address.district);
  result.address = Object.keys(address).length ? {
    address: scalar(address.street ?? address.streetAddress), neighborhood: result.neighborhood,
    city: result.city, number: scalar(address.streetNumber), zipCode: scalar(address.zipCode ?? address.postalCode),
    stateName: scalar(address.state), stateAcronym: scalar(address.stateAcronym ?? address.addressRegion),
    lat: result.lat, lng: result.lng, countryName: scalar(address.country ?? address.addressCountry?.name ?? address.addressCountry), countryCode: null,
  } : null;
  const pricing = Array.isArray(source.pricingInfos) ? source.pricingInfos : [];
  const rent = pricing.find(price => ['RENTAL', 'RENT'].includes(price.businessType));
  const sale = pricing.find(price => price.businessType === 'SALE');
  if (rent) {
    result.forRent = true;
    result.rentValue = number(rent.price);
    result.condominiumValue = number(rent.monthlyCondoFee);
    result.iptuValue = number(rent.yearlyIptu);
    if (result.iptuValue !== null) result.iptuType = 'YEARLY';
  }
  if (sale) { result.forSale = true; result.salePrice = number(sale.price); }
  if (source.prices?.rental) {
    result.forRent = true;
    result.rentValue = number(source.prices.rental.value);
    result.condominiumValue = number(source.prices.rental.condominium);
    result.iptuValue = number(source.prices.rental.iptu);
  }
  const offers = Array.isArray(source.offers) ? source.offers : source.offers ? [source.offers] : [];
  const offer = offers.find(item => /LeaseOut|Rent/i.test(String(item.businessFunction)));
  if (offer) { result.forRent = true; result.rentValue ??= number(offer.price ?? offer.priceSpecification?.price); }
  const types = { APARTMENT: 'Apartamento', HOUSE: 'Casa', CONDOMINIUM: 'Casa de condomínio', STUDIO: 'Studio' };
  result.type = types[estate.unitType || estate.unitTypes?.[0]] || (/Apartment/.test(String(estate['@type'])) ? 'Apartamento' : null);
  const media = estate.medias?.images || estate.medias || estate.images || estate.image || source.image;
  if (media) {
    const images = (Array.isArray(media) ? media : [media]).filter(item => typeof item === 'string' || !item.type || ['IMAGE', 'image'].includes(item.type)).map(item => {
      const template = typeof item === 'string' ? item : item.url || item.contentUrl || item.dangerousSrc;
      const path = template?.replaceAll('{description}', 'foto-do-imovel').replaceAll('{action}', 'fit-in').replaceAll('{width}', '1280').replaceAll('{height}', '960');
      if (!path) return null;
      try { const imageUrl = new URL(path, url); return ['https:', 'http:'].includes(imageUrl.protocol) ? { url: imageUrl.href, subtitle: typeof item === 'object' ? scalar(item.caption ?? item.description) : null } : null; } catch { return null; }
    }).filter(Boolean);
    result.images = images.length ? [...new Map(images.map(item => [item.url, item])).values()] : null;
    result.mainImageUrl = result.images?.[0]?.url ?? null;
  }
  const amenities = Array.isArray(estate.amenities) ? estate.amenities : features.values;
  if (Array.isArray(amenities)) {
    if (amenities.includes('PETS_ALLOWED')) result.acceptPets = true;
    if (amenities.includes('FURNISHED')) result.isFurnished = true;
    if (amenities.includes('ELEVATOR')) result.hasElevator = true;
    if (amenities.includes('FULL_TIME_CONCIERGE') || amenities.includes('CONCIERGE_24H')) result.doormanType = 'horas24';
    if (amenities.includes('PARTY_HALL')) result.installations = [{ key: 'SALAO_DE_FESTAS', text: 'Salão de festas', value: 'SIM' }];
  }
  return { property: result, extracted: true, reason: null };
}

export function applyVisibleData(property, visible) {
  const text = visible.text.split(/Imóveis semelhantes|Veja outros imóveis|Explore outros imóveis/i)[0];
  const money = value => value ? Number(value.replace(/\./g, '').replace(',', '.')) : null;
  const amount = label => money(text.match(new RegExp(`${label}\\s*\\n\\s*R\\$\\s*([\\d.,]+)`, 'i'))?.[1]);
  const metric = label => number(text.match(new RegExp(`${label}\\s*\\n\\s*(\\d+(?:[.,]\\d+)?)`, 'i'))?.[1]?.replace(',', '.'));
  property.totalArea ??= metric('Metragem');
  property.bedrooms ??= metric('Quartos');
  property.bathrooms ??= metric('Banheiros');
  property.parkingSlots ??= metric('Vagas');
  const rent = amount('Aluguel');
  if (rent !== null) { property.rentValue = rent; property.forRent = true; }
  property.condominiumValue ??= amount('Condomínio');
  property.iptuValue ??= amount('IPTU');
  property.totalCost ??= amount('Valor total previsto');
  if (/(?:^|\n)\s*Aceita animais\s*(?:\n|$)/i.test(text)) property.acceptPets = true;
  if (/(?:^|\n)\s*Mobiliado\s*(?:\n|$)/i.test(text)) property.isFurnished ??= true;
  property.type ??= /^Apartamento/.test(visible.title || '') ? 'Apartamento' : null;
  const location = text.match(/Localização\s*\n\s*([^\n]+ - [^\n]+, [^\n]+ - [A-Z]{2})/);
  const address = location?.[1]?.match(/^(.+?)(?:,\s*(\d+))?\s+-\s+(.+?),\s*(.+?)\s+-\s+([A-Z]{2})$/);
  if (address) {
    property.city ??= address[4]; property.neighborhood ??= address[3];
    property.address ??= { address: address[1], number: address[2] || null, neighborhood: property.neighborhood, city: property.city, stateAcronym: address[5], zipCode: null, lat: property.lat, lng: property.lng };
  }
  if (!property.images && visible.images?.length) {
    property.images = [...new Map(visible.images.filter(image => /^https?:\/\//.test(image.url)).map(image => [image.url, image])).values()];
    property.mainImageUrl = property.images[0]?.url || null;
  }
  return property;
}

async function readBrowser(url, args) {
  console.error('Abrindo Chrome visível em perfil isolado…');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 15000 });
    const title = await page.locator('h1').first().innerText();
    if (/blocked|attention required|access denied|verify.*human/i.test(title) || response?.status() === 403) throw new Error('O site bloqueou o navegador. Nenhuma tentativa de contornar o bloqueio foi feita.');
    await page.getByText('Valor total previsto', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
    const html = await page.content();
    const visible = await page.evaluate(() => ({
      title: document.querySelector('h1')?.textContent || '', text: document.body.innerText,
      photoCount: Number(document.querySelector('[aria-label="Galeria de fotos do imóvel"]')?.textContent.match(/(\d+)\s*fotos/)?.[1]) || null,
      images: [...document.querySelectorAll('[aria-label="Galeria de fotos do imóvel"] img')].map(image => ({ url: image.currentSrc || image.src, subtitle: image.alt || null })),
    }));
    const saveIndex = args.indexOf('--save-html');
    if (saveIndex >= 0) {
      if (!args[saveIndex + 1]) throw new Error('Informe o caminho para --save-html.');
      await writeFile(args[saveIndex + 1], html);
    }
    return { html, visible, status: response?.status() || 200 };
  } finally { await browser.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--self-test') {
    const { default: assert } = await import('node:assert/strict');
    const url = 'https://www.vivareal.com.br/imovel/exemplo-id-2909076148/';
    const listing = { id: '2909076148', usableAreas: ['45'], bedrooms: [2], address: { city: 'São Paulo', point: { lat: -23.55, lon: -46.64 } }, pricingInfos: [{ businessType: 'RENTAL', price: '2800', monthlyCondoFee: '500', yearlyIptu: '1200' }], unitTypes: ['APARTMENT'], amenities: ['PETS_ALLOWED'], medias: [{ type: 'IMAGE', url: 'https://example.com/foto.jpg' }] };
    const { property } = extractVivaReal(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ listing })}</script>`, url);
    assert.equal(property.rentValue, 2800); assert.equal(property.lat, -23.55); assert.equal(property.acceptPets, true); assert.equal(property.totalCost, null); assert.equal(property.iptuType, 'YEARLY');
    assert.equal(extractVivaReal('<h1>Access denied</h1>', url).extracted, false);
    assert.equal(extractVivaReal('<h1>Access denied</h1>', url).property.rentValue, null);
    const modern = { id: '2909076148', prices: { rental: { value: 2800, condominium: 735, iptu: 90 } }, address: { city: 'São Paulo', coordinates: { latitude: -23.55, longitude: -46.65 } }, unitType: 'APARTMENT', amenities: { usableAreas: [45], bedrooms: [2], bathrooms: [2], parkingSpaces: [0], values: ['CONCIERGE_24H'] }, medias: { images: [{ dangerousSrc: 'https://example.com/{description}.webp?dimension={width}x{height}&action={action}' }] } };
    const flight = JSON.stringify([1, `1:${JSON.stringify({ tracking: { listingId: modern.id, address: {} }, listing: modern })}\n`]);
    const hydrated = extractVivaReal(`<script>self.__next_f.push(${flight})</script>`, url).property;
    assert.equal(hydrated.rentValue, 2800); assert.equal(hydrated.lat, -23.55); assert.equal(hydrated.images.length, 1); assert.equal(hydrated.doormanType, 'horas24');
    applyVisibleData(hydrated, { text: 'Valor total previsto\nR$ 3.625\n', title: '' });
    assert.equal(hydrated.totalCost, 3625);
    assert.equal(hydrated.status, null);
    const longText = 'Descrição com acentuação: São Paulo\nOBS.: descrição longa sem quebra final';
    const stream = `:HL["/style.css","style"]\na:T${Buffer.byteLength(longText).toString(16)},${longText}b:${JSON.stringify({ listing: modern })}\n`;
    const textRecord = JSON.stringify([1, stream]);
    const withDescription = extractVivaReal(`<script>self.__next_f.push(${textRecord})</script>`, url).property;
    assert.equal(withDescription.images.length, 1);
    assert.equal(withDescription.lat, -23.55);
    console.error('Testes do scraper passaram.');
    return;
  }
  const url = args[0];
  if (!url) throw new Error('Uso: bun scrap-vivareal.mjs URL [--html arquivo.html | --http] [--save-html arquivo.html] > resultado.json. Por padrão, abre Chrome visível via Playwright.');
  extractVivaReal('', url);
  const htmlIndex = args.indexOf('--html');
  let html;
  let visible;
  let status = 200;
  if (htmlIndex >= 0) {
    if (!args[htmlIndex + 1]) throw new Error('Informe o caminho do HTML salvo.');
    html = await readFile(args[htmlIndex + 1], 'utf8');
  } else if (args.includes('--http')) {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
    status = response.status;
    html = await response.text();
  } else {
    ({ html, visible, status } = await readBrowser(url, args));
  }
  const result = extractVivaReal(status >= 200 && status < 300 ? html : '', url);
  if (visible) {
    applyVisibleData(result.property, visible);
    result.extracted = result.extracted || result.property.rentValue !== null || result.property.totalArea !== null;
    if (visible.photoCount && (result.property.images?.length || 0) < visible.photoCount) throw new Error(`Galeria incompleta: ${result.property.images?.length || 0} de ${visible.photoCount} fotos. Importação cancelada; tente novamente ou revise o parser.`);
  }
  console.log(JSON.stringify(result.property, null, 2));
  if (!result.extracted) {
    console.error(status === 403 ? 'HTTP 403: o Viva Real bloqueou o acesso automatizado. JSON contém apenas ID/URL e campos null. É possível testar com --html usando uma página salva pelo navegador.' : `HTTP ${status}: ${result.reason}`);
    process.exitCode = 2;
  } else console.error(`JSON extraído. ${result.property.images?.length || 0} fotos encontradas. Campos não encontrados são null; disponibilidade não foi inferida. Não importado para imoveis.json.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
