import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function inspectStorage() {
  console.log(`Checking Firebase Storage Bucket: ${firebaseConfig.storageBucket}`);
  try {
    const rootRef = ref(storage, '/');
    const res = await listAll(rootRef);
    console.log(`Prefixes (folders): ${res.prefixes.length}`);
    for (const folderRef of res.prefixes) {
      console.log(`- Folder: ${folderRef.name}`);
      const folderRes = await listAll(folderRef);
      console.log(`  Items in ${folderRef.name}: ${folderRes.items.length}`);
    }
    console.log(`Root Items: ${res.items.length}`);
    for (const itemRef of res.items) {
      console.log(`- Item: ${itemRef.name}`);
    }
  } catch (err: any) {
    console.log(`Storage list notice: ${err.message}`);
  }
  process.exit(0);
}

inspectStorage();
