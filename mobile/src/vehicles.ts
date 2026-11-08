export type Vehicle = { id: string; name: string; className: string; modelPage: string; modelUrl?: string };
export const VEHICLES: Vehicle[] = [
  { id:'sports-coupe', name:'Sports Coupe', className:'Sport', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'family-suv', name:'Family SUV', className:'SUV', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'family-sedan', name:'Family Sedan', className:'Sedan', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'convertible', name:'Open Convertible', className:'Sport', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'pickup', name:'Utility Pickup', className:'Pickup', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'minivan', name:'Family Minivan', className:'Van', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'hatchback', name:'Compact Hatchback', className:'Compact', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'limousine', name:'Stretch Limousine', className:'Luxury', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'camper', name:'Camper RV', className:'Utility', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'mini-ev', name:'Electric Mini', className:'Electric', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'ice-cream-truck', name:'Ice Cream Truck', className:'Commercial', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'delivery-van', name:'Delivery Van', className:'Commercial', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'garbage-truck', name:'Refuse Truck', className:'Commercial', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'tow-truck', name:'Recovery Truck', className:'Commercial', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'monster-truck', name:'Monster Truck', className:'Off-road', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'golf-cart', name:'Golf Cart', className:'Utility', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'rescue-vehicle', name:'Rescue Vehicle', className:'Emergency', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'police-sedan', name:'Patrol Sedan', className:'Emergency', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'taxi', name:'City Taxi', className:'Sedan', modelPage:'https://shuriken.studio/kits/town-vehicles' },
  { id:'roadster', name:'Classic Roadster', className:'Classic', modelPage:'https://shuriken.studio/kits/town-vehicles' }
];
