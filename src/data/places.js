// The 12 featured places. `view` is the photoreal (Google 3D Tiles) viewpoint:
// lat/lon/h of the landmark, camera range (m), heading and pitch (degrees).
// `tz` is the IANA zone used for the local-time line on the card.
export const PLACES = [
  { id:'beijing',   name:'北京',       region:'中国',     lat:39.9042, lon:116.4074, tz:'Asia/Shanghai', color:'#ffcf8a', desc:'故宫的红墙与胡同的灰瓦，三千年的城，一年四季都有自己的颜色。', spot:'故宫', view:{ lat:39.9163, lon:116.3972, h:40,   range:950,  heading:0,   pitch:-32 } },
  { id:'shanghai',  name:'上海',       region:'中国',     lat:31.2304, lon:121.4737, tz:'Asia/Shanghai', color:'#ffb37a', desc:'外滩一边是百年万国建筑，一边是陆家嘴的天际线，黄浦江把它们隔开又连在一起。', spot:'外滩 · 陆家嘴', view:{ lat:31.2385, lon:121.4950, h:15,   range:1400, heading:100, pitch:-24 } },
  { id:'tokyo',     name:'东京',       region:'日本',     lat:35.6762, lon:139.6503, tz:'Asia/Tokyo', color:'#ff8fb1', desc:'霓虹与神社并存的城市，凌晨的便利店和清晨的筑地一样迷人。', spot:'东京塔', view:{ lat:35.6586, lon:139.7454, h:60,   range:850,  heading:20,  pitch:-28 } },
  { id:'reykjavik', name:'雷克雅未克', region:'冰岛',     lat:64.1466, lon:-21.9426, tz:'Atlantic/Reykjavik', color:'#8affd6', desc:'世界最北的首都之一，冬夜抬头就可能撞见极光。', spot:'哈尔格林姆斯教堂', view:{ lat:64.1417, lon:-21.9266, h:110, range:700, heading:300, pitch:-30 } },
  { id:'paris',     name:'巴黎',       region:'法国',     lat:48.8566, lon:2.3522,   tz:'Europe/Paris', color:'#c9a2ff', desc:'塞纳河左岸的书店、右岸的咖啡馆，铁塔每到整点会闪烁五分钟。', spot:'埃菲尔铁塔', view:{ lat:48.8584, lon:2.2945,   h:80,   range:950,  heading:135, pitch:-24 } },
  { id:'cairo',     name:'开罗',       region:'埃及',     lat:30.0444, lon:31.2357,  tz:'Africa/Cairo', color:'#ffd37a', desc:'尼罗河畔的古老都城，吉萨金字塔就在城市边缘静静站了四千五百年。', spot:'吉萨金字塔', view:{ lat:29.9773, lon:31.1325,  h:85,   range:1300, heading:230, pitch:-24 } },
  { id:'capetown',  name:'开普敦',     region:'南非',     lat:-33.9249,lon:18.4241,  tz:'Africa/Johannesburg', color:'#7cffb2', desc:'桌山的平顶被云铺成“桌布”，两大洋在好望角附近交汇。', spot:'V&A 码头 · 桌山', view:{ lat:-33.9050,lon:18.4210, h:35, range:1500, heading:200, pitch:-20 } },
  { id:'newyork',   name:'纽约',       region:'美国',     lat:40.7128, lon:-74.0060, tz:'America/New_York', color:'#7cc4ff', desc:'不眠之城。中央公园是曼哈顿钢铁森林中间的一大片绿。', spot:'中央公园 · 中城', view:{ lat:40.7680, lon:-73.9750, h:-10, range:1300, heading:200, pitch:-28 } },
  { id:'sf',        name:'旧金山',     region:'美国',     lat:37.7749, lon:-122.4194,tz:'America/Los_Angeles', color:'#ff9f7a', desc:'金门大桥常常藏在雾里，坡道上的叮当车一路开向海湾。', spot:'金门大桥', view:{ lat:37.8199, lon:-122.4783, h:40,  range:1600, heading:315, pitch:-20 } },
  { id:'rio',       name:'里约热内卢', region:'巴西',     lat:-22.9068,lon:-43.1729, tz:'America/Sao_Paulo', color:'#ffe27a', desc:'基督像张开双臂俯瞰海湾，科帕卡巴纳海滩的浪声昼夜不停。', spot:'科帕卡巴纳 · 面包山', view:{ lat:-22.9711,lon:-43.1822, h:0, range:1500, heading:30, pitch:-25 } },
  { id:'sydney',    name:'悉尼',       region:'澳大利亚', lat:-33.8688,lon:151.2093, tz:'Australia/Sydney', color:'#7ad8ff', desc:'歌剧院的白色风帆与港湾大桥，是南半球最好认的海港。', spot:'悉尼歌剧院', view:{ lat:-33.8568,lon:151.2153, h:25,  range:900,  heading:150, pitch:-28 } },
  { id:'machu',     name:'马丘比丘',   region:'秘鲁',     lat:-13.1631,lon:-72.5450, tz:'America/Lima', color:'#a6ff7a', desc:'安第斯山脊上的印加古城，清晨云雾散开时最动人。', spot:'马丘比丘古城', view:{ lat:-13.1631,lon:-72.5450, h:2450, range:900, heading:330, pitch:-20 } },
];

export const placeIndex = (id) => PLACES.findIndex((p) => p.id === id);
