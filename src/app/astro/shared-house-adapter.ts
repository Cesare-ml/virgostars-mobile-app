/** Map explicit native angle facts to shared house methods; no astronomy is computed here. */
import {calculateVehlowHouseCusps} from 'astrological-functions/vehlow-houses';
import {calculatePorphyryHouseCusps} from 'astrological-functions/porphyry-houses';
import {calculatePlacidusHouseCusps} from 'astrological-functions/placidus-houses';
import {calculateKochHouseCusps} from 'astrological-functions/koch-houses';
import {calculateRegiomontanusHouseCusps} from 'astrological-functions/regiomontanus-houses';
import type {ChartHouseSystemV1, ChartProviderV1, ChartRequestV1, ChartSnapshotV1, HouseSystemId} from '../native/chart-calculation-contract';

export function assembleSharedHouses(chart:ChartSnapshotV1, provider:ChartProviderV1, request:ChartRequestV1): ChartSnapshotV1 {
  const facts = chart.houseAngleFacts;
  const epoch = Date.parse(request.utcIso);
  if (provider.id !== 'virgostars_ephemeris' || provider.engineVersion !== 'core-0.1.0-6835e00' || !facts ||
      facts.model !== 'iau2006_2000b_utc_as_ut1' || !Number.isFinite(epoch) ||
      Math.abs(epoch - (chart.julianDayUt - 2_440_587.5) * 86_400_000) > 1 ||
      facts.latitudeDeg !== request.latMicro / 1e6 || facts.longitudeDegEast !== request.lngMicro / 1e6 ||
      chart.houses.length !== 0 || chart.unavailableHouseSystems.length !== 5) throw new Error('Incompatible house-angle facts');
  const source = {
    engineVersion:provider.engineVersion, kernelSetId:'external_de441_unverified', timeModel:`${facts.timeSource}_utc_as_ut1`,
    center:'EARTH' as const, frame:'ECLIPTIC_OF_DATE' as const, corrections:'IAU2006_2000B_APPROXIMATE' as const,
    zodiac:'TROPICAL' as const, observerType:'TOPOCENTRIC' as const,
    observer:{latitudeDeg:facts.latitudeDeg, longitudeDegEast:facts.longitudeDegEast},
  };
  const common = {datetimeUtc:request.utcIso, birthTimeKnown:true as const, ascendantDeg:facts.ascendantDeg,
    midheavenDeg:facts.mcDeg, armcDeg:facts.armcDeg, trueObliquityDeg:facts.trueObliquityDeg, source};
  const methods: ReadonlyArray<readonly [HouseSystemId, () => readonly number[]]> = [
    ['egizia', () => calculateVehlowHouseCusps({...common, profile:'VEHLOW_ASC_CENTERED_V1'}).cuspsDeg],
    ['placido', () => calculatePlacidusHouseCusps(common).cuspsDeg],
    ['koch', () => calculateKochHouseCusps(common).cuspsDeg],
    ['regio-montano', () => calculateRegiomontanusHouseCusps(common).cuspsDeg],
    ['porfirio', () => calculatePorphyryHouseCusps(common).cuspsDeg],
  ];
  const houses:ChartHouseSystemV1[] = [], unavailable:HouseSystemId[] = [];
  for (const [id, method] of methods) {
    try {
      const cusps = method();
      if (cusps.length !== 12 || cusps.some(value => !Number.isFinite(value) || value < 0 || value >= 360)) throw new Error('Invalid cusps');
      houses.push(Object.freeze({id, cuspsDeg:Object.freeze([...cusps]), ascendantDeg:facts.ascendantDeg,
        mcDeg:facts.mcDeg, armcDeg:facts.armcDeg, vertexDeg:facts.vertexDeg}));
    } catch { unavailable.push(id); }
  }
  return Object.freeze({...chart, houses:Object.freeze(houses), unavailableHouseSystems:Object.freeze(unavailable)});
}
