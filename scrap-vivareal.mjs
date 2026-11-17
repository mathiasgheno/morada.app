import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const fields = 'id lat lng bedrooms parkingSlots bathrooms rentValue condominiumValue iptuValue salePrice forRent forSale saleType code displayCode status totalArea acceptPets isFurnished nearSubway city neighborhood condominium images amenities comfortCommodities practicalityCommodities installations address local placesNearby region macroRegion availabilityType allowsCustomOffer displayCustomOfferPreference mainImageUrl shortUrl type suites hasElevator doormanType totalCost homeownersInsuranceValue iptuType condominiumType garages iptuDetails houseVisitStatus specialConditions allowRepublishing youtubeVideoId lastPublishedDate allowDirectOffer promotions rentOnTermination rentOnTerminationPublished terminationDate isPrimaryMarket listings cityId tenantServiceFee tenantServiceFeePercentage rentalGuarantee leadReference relations totalCostWithoutRentalGuarantee totalCostWithoutTenantServiceFee rangeFloor generatedDescription video nearbyEstablishments'.split(' ');
const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const scalar = value => typeof value === 'string' || typeof value === 'number' ? value : null;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

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
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json|application\/json|__NEXT_DATA__/i.test(script[1])) continue;
    try { roots.push(JSON.parse(script[2])); }
    catch { try { roots.push(JSON.parse(decode(script[2]))); } catch {} }
  }
  const nodes = roots.flatMap(objects);
  const listing = nodes.find(item => String(item.id ?? item.listingId) === id && (item.pricingInfos || item.usableAreas || item.unitTypes || item.address));
  const listingLd = nodes.find(item => /RealEstateListing|Apartment|Residence|House|Product/.test(String(item['@type'])) && (String(item.url || item['@id'] || '').includes(id) || String(item.identifier?.value ?? item.identifier) === id));
  const source = listing || listingLd;
  if (!source) return { property: result, extracted: false, reason: 'Nenhum dado estruturado identificável para este anúncio foi encontrado. Não foram usados os valores do slug da URL.' };
  const estate = source.mainEntity || source.itemOffered || source;
  const address = estate.address || source.address || {};
  const point = address.point || estate.geo || estate.point || {};
  result.lat = number(point.lat ?? point.latitude);
  result.lng = number(point.lon ?? point.lng ?? point.longitude);
  result.bedrooms = number(Array.isArray(estate.bedrooms) ? estate.bedrooms[0] : estate.bedrooms ?? estate.numberOfBedrooms);
  result.bathrooms = number(Array.isArray(estate.bathrooms) ? estate.bathrooms[0] : estate.bathrooms ?? estate.numberOfBathroomsTotal);
  result.parkingSlots = number(Array.isArray(estate.parkingSpaces) ? estate.parkingSpaces[0] : estate.parkingSpaces);
  result.totalArea = number(estate.usableAreas?.[0] ?? estate.floorSize?.value);
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
  const offers = Array.isArray(source.offers) ? source.offers : source.offers ? [source.offers] : [];
  const offer = offers.find(item => /LeaseOut|Rent/i.test(String(item.businessFunction)));
  if (offer) { result.forRent = true; result.rentValue ??= number(offer.price ?? offer.priceSpecification?.price); }
  const types = { APARTMENT: 'Apartamento', HOUSE: 'Casa', CONDOMINIUM: 'Casa de condomínio', STUDIO: 'Studio' };
  result.type = types[estate.unitTypes?.[0]] || (/Apartment/.test(String(estate['@type'])) ? 'Apartamento' : null);
  const media = estate.medias || estate.images || estate.image || source.image;
  if (media) {
    const images = (Array.isArray(media) ? media : [media]).filter(item => typeof item === 'string' || !item.type || ['IMAGE', 'image'].includes(item.type)).map(item => {
      const path = typeof item === 'string' ? item : item.url || item.contentUrl;
      if (!path) return null;
      try { const imageUrl = new URL(path, url); return ['https:', 'http:'].includes(imageUrl.protocol) ? { url: imageUrl.href, subtitle: typeof item === 'object' ? scalar(item.caption ?? item.description) : null } : null; } catch { return null; }
    }).filter(Boolean);
    result.images = images.length ? [...new Map(images.map(item => [item.url, item])).values()] : null;
    result.mainImageUrl = result.images?.[0]?.url ?? null;
  }
  const amenities = estate.amenities;
  if (Array.isArray(amenities)) {
    if (amenities.includes('PETS_ALLOWED')) result.acceptPets = true;
    if (amenities.includes('FURNISHED')) result.isFurnished = true;
    if (amenities.includes('ELEVATOR')) result.hasElevator = true;
    if (amenities.includes('FULL_TIME_CONCIERGE')) result.doormanType = 'horas24';
    if (amenities.includes('PARTY_HALL')) result.installations = [{ key: 'SALAO_DE_FESTAS', text: 'Salão de festas', value: 'SIM' }];
  }
  return { property: result, extracted: true, reason: null };
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
    console.error('Testes do scraper passaram.');
    return;
  }
  const url = args[0];
  if (!url) throw new Error('Uso: bun scrap-vivareal.mjs URL [--html arquivo.html] > resultado.json');
  extractVivaReal('', url);
  const htmlIndex = args.indexOf('--html');
  let html;
  let status = 200;
  if (htmlIndex >= 0) {
    if (!args[htmlIndex + 1]) throw new Error('Informe o caminho do HTML salvo.');
    html = await readFile(args[htmlIndex + 1], 'utf8');
  } else {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
    status = response.status;
    html = await response.text();
  }
  const result = extractVivaReal(status >= 200 && status < 300 ? html : '', url);
  console.log(JSON.stringify(result.property, null, 2));
  if (!result.extracted) {
    console.error(status === 403 ? 'HTTP 403: o Viva Real bloqueou o acesso automatizado. JSON contém apenas ID/URL e campos null. É possível testar com --html usando uma página salva pelo navegador.' : `HTTP ${status}: ${result.reason}`);
    process.exitCode = 2;
  } else console.error('JSON extraído de dados estruturados do HTML. Campos não encontrados são null; disponibilidade e custo total não foram inferidos.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
