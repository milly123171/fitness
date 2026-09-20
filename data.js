// 預設食物資料庫（每 100 公克營養素，取一般常見數值，僅供估算參考）
const SEED_FOODS = [
  // 蛋白質
  { name: "雞胸肉(去皮生)", category: "蛋白質", cal: 106, protein: 22.5, carb: 0, fat: 1.5 },
  { name: "雞腿肉(去皮)", category: "蛋白質", cal: 157, protein: 19, carb: 0, fat: 8.5 },
  { name: "牛腱", category: "蛋白質", cal: 137, protein: 22, carb: 0, fat: 5 },
  { name: "牛絞肉(瘦)", category: "蛋白質", cal: 187, protein: 20, carb: 0, fat: 12 },
  { name: "豬里肌肉", category: "蛋白質", cal: 143, protein: 21, carb: 0, fat: 6 },
  { name: "鮭魚", category: "蛋白質", cal: 208, protein: 20, carb: 0, fat: 13 },
  { name: "鯛魚片", category: "蛋白質", cal: 96, protein: 20, carb: 0, fat: 1.7 },
  { name: "鮪魚(水煮罐頭)", category: "蛋白質", cal: 116, protein: 25, carb: 0, fat: 1 },
  { name: "蝦仁", category: "蛋白質", cal: 99, protein: 21, carb: 0.2, fat: 1 },
  { name: "雞蛋(全蛋)", category: "蛋白質", cal: 143, protein: 12.6, carb: 0.7, fat: 9.9 },
  { name: "蛋白(生)", category: "蛋白質", cal: 52, protein: 11, carb: 0.7, fat: 0.2 },
  { name: "豆腐(嫩)", category: "蛋白質", cal: 55, protein: 5.5, carb: 1.5, fat: 3 },
  { name: "豆干", category: "蛋白質", cal: 191, protein: 19, carb: 4, fat: 11 },
  { name: "毛豆(去莢)", category: "蛋白質", cal: 135, protein: 12.5, carb: 10, fat: 5.5 },
  { name: "乳清蛋白粉", category: "蛋白質", cal: 380, protein: 78, carb: 8, fat: 5 },

  // 全穀根莖
  { name: "白飯", category: "全穀根莖", cal: 130, protein: 2.7, carb: 28, fat: 0.3 },
  { name: "糙米飯", category: "全穀根莖", cal: 123, protein: 2.7, carb: 25.6, fat: 1 },
  { name: "地瓜(蒸)", category: "全穀根莖", cal: 86, protein: 1.6, carb: 20, fat: 0.1 },
  { name: "馬鈴薯(蒸)", category: "全穀根莖", cal: 77, protein: 2, carb: 17, fat: 0.1 },
  { name: "燕麥片(生)", category: "全穀根莖", cal: 389, protein: 16.9, carb: 66, fat: 6.9 },
  { name: "全麥吐司", category: "全穀根莖", cal: 265, protein: 9, carb: 49, fat: 3.5 },
  { name: "義大利麵(熟)", category: "全穀根莖", cal: 158, protein: 5.8, carb: 31, fat: 0.9 },
  { name: "玉米(熟)", category: "全穀根莖", cal: 96, protein: 3.4, carb: 21, fat: 1.5 },

  // 蔬菜
  { name: "花椰菜(熟)", category: "蔬菜", cal: 35, protein: 2.4, carb: 7, fat: 0.4 },
  { name: "菠菜(熟)", category: "蔬菜", cal: 23, protein: 2.9, carb: 3.6, fat: 0.4 },
  { name: "高麗菜(生)", category: "蔬菜", cal: 25, protein: 1.3, carb: 5.8, fat: 0.1 },
  { name: "小黃瓜", category: "蔬菜", cal: 15, protein: 0.7, carb: 3.6, fat: 0.1 },
  { name: "番茄", category: "蔬菜", cal: 18, protein: 0.9, carb: 3.9, fat: 0.2 },
  { name: "地瓜葉(熟)", category: "蔬菜", cal: 31, protein: 2.6, carb: 5.5, fat: 0.3 },
  { name: "玉米筍", category: "蔬菜", cal: 27, protein: 2.4, carb: 5, fat: 0.3 },

  // 水果
  { name: "香蕉", category: "水果", cal: 89, protein: 1.1, carb: 22.8, fat: 0.3 },
  { name: "蘋果", category: "水果", cal: 52, protein: 0.3, carb: 13.8, fat: 0.2 },
  { name: "芭樂", category: "水果", cal: 68, protein: 2.6, carb: 14.3, fat: 1 },
  { name: "藍莓", category: "水果", cal: 57, protein: 0.7, carb: 14.5, fat: 0.3 },
  { name: "奇異果", category: "水果", cal: 61, protein: 1.1, carb: 14.7, fat: 0.5 },

  // 乳製品
  { name: "無糖優格", category: "乳製品", cal: 61, protein: 3.5, carb: 4.7, fat: 3.3 },
  { name: "希臘優格(無糖)", category: "乳製品", cal: 59, protein: 10, carb: 3.6, fat: 0.4 },
  { name: "低脂牛奶", category: "乳製品", cal: 42, protein: 3.4, carb: 5, fat: 1 },
  { name: "全脂牛奶", category: "乳製品", cal: 61, protein: 3.2, carb: 4.8, fat: 3.3 },
  { name: "起司片", category: "乳製品", cal: 328, protein: 22, carb: 2, fat: 25 },
  { name: "茅屋起司", category: "乳製品", cal: 98, protein: 11, carb: 3.4, fat: 4.3 },

  // 油脂與堅果
  { name: "橄欖油", category: "油脂", cal: 884, protein: 0, carb: 0, fat: 100 },
  { name: "花生醬", category: "油脂", cal: 588, protein: 25, carb: 20, fat: 50 },
  { name: "杏仁", category: "油脂", cal: 579, protein: 21, carb: 22, fat: 50 },
  { name: "核桃", category: "油脂", cal: 654, protein: 15, carb: 14, fat: 65 },
  { name: "酪梨", category: "油脂", cal: 160, protein: 2, carb: 8.5, fat: 14.7 },

  // 其他
  { name: "白吐司", category: "其他", cal: 265, protein: 9, carb: 50, fat: 3.2 },
  { name: "香蕉蛋白飲(自製)", category: "其他", cal: 120, protein: 8, carb: 18, fat: 1.5 },
];
