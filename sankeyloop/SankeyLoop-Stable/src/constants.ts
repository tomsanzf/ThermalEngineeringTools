import { Flow } from './types';

export const DEFAULT_FLOWS: Flow[] = [
  {Source:"Gas",           Target:"Boiler",              Value:"78",  Color:"Black"},
  {Source:"Boiler",        Target:"Steam",               Value:"67",  Color:"200"},
  {Source:"Boiler",        Target:"Purge",               Value:"1",   Color:"170"},
  {Source:"Boiler",        Target:"Stack",               Value:"10",  Color:"Black"},
  {Source:"Steam",         Target:"Deaerator",           Value:"6",   Color:"200"},
  {Source:"Deaerator",     Target:"Boiler",              Value:"2",   Color:"105"},
  {Source:"Feedwater",     Target:"Deaerator",           Value:"-4",  Color:"20"},
  {Source:"Steam",         Target:"Process",             Value:"60",  Color:"200"},
  {Source:"Process",       Target:"Condensate Return",   Value:"0",   Color:"90"},
  {Source:"Process",       Target:"Cndnste Not Returned",Value:"0",   Color:"Black"},
  {Source:"Condensate Return",Target:"Deaerator",        Value:"0",   Color:"90"},
  {Source:"Process",       Target:"Chilled Water",       Value:"60",  Color:"20"},
  {Source:"Chilled Water", Target:"Chiller",             Value:"60",  Color:"10"},
  {Source:"Elec",          Target:"Chiller",             Value:"20",  Color:"Elec"},
  {Source:"Chiller",       Target:"HP",                  Value:"80",  Color:"30"},
  {Source:"Elec",          Target:"HP",                  Value:"27",  Color:"Elec"},
  {Source:"HP",            Target:"Process",             Value:"107", Color:"90"},
];

export const NAMED_COLORS: Record<string, string> = {
  red:"#FF0000",green:"#008000",blue:"#0000FF",yellow:"#FFFF00",orange:"#FFA500",
  purple:"#800080",pink:"#FFC0CB",brown:"#A52A2A",black:"#000000",white:"#FFFFFF",
  grey:"#808080",gray:"#808080",cyan:"#00FFFF",magenta:"#FF00FF",lime:"#00FF00",
  navy:"#000080",teal:"#008080",maroon:"#800000",olive:"#808000",coral:"#FF7F50",
  salmon:"#FA8072",gold:"#FFD700",indigo:"#4B0082",violet:"#EE82EE",turquoise:"#40E0D0",
  silver:"#C0C0C0",beige:"#F5F5DC",lavender:"#E6E6FA",khaki:"#F0E68C",crimson:"#DC143C",
};
