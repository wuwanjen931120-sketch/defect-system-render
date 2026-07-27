"use strict";

require("dotenv").config();
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("請先設定 MONGODB_URI");

async function findBatch(collection) {
  return collection.aggregate([
    { $sort: { timestamp: -1, _id: -1 } },
    {
      $group: {
        _id: { tenant_id: "$tenant_id", system_id: "$system_id", id: "$id" },
        keep: { $first: "$_id" },
        all: { $push: "$_id" },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 500 }
  ], { allowDiskUse: true }).toArray();
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 5 });
  const collection = mongoose.connection.collection("defects");
  let duplicateGroups = 0;
  let duplicateDocuments = 0;

  for (;;) {
    const groups = await findBatch(collection);
    if (!groups.length) break;
    duplicateGroups += groups.length;
    const ids = groups.flatMap(group => group.all.filter(id => String(id) !== String(group.keep)));
    duplicateDocuments += ids.length;
    console.log(`找到 ${groups.length} 組、${ids.length} 筆重複資料${apply ? "，正在刪除" : ""}`);
    if (!apply) break;
    if (ids.length) await collection.deleteMany({ _id: { $in: ids } });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    duplicate_groups: duplicateGroups,
    duplicate_documents: duplicateDocuments
  }, null, 2));
  if (!apply && duplicateDocuments > 0) {
    console.log("確認結果後執行：npm run deduplicate:defects -- --apply");
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
