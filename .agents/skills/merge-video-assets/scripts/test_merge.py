#!/usr/bin/env python3
"""Exercise real merges in a temporary library without touching the live catalog."""
import hashlib, json, os, shutil, subprocess, tempfile, unittest, zipfile
from pathlib import Path

SCRIPTS=Path(__file__).resolve().parent
WORKSPACE=Path(os.environ.get('TALKCRAFT_TEST_WORKSPACE', Path.cwd())).resolve()

class MergeTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='talkcraft-merge-test-')
        self.root=Path(self.tmp.name);self.library=self.root/'library';self.source=self.root/'source'
        self.library.mkdir();self.source.mkdir()
        (self.library/'node_modules').symlink_to(WORKSPACE/'node_modules',target_is_directory=True)
        (self.source/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="5" fill="orange"/></svg>')
        (self.source/'effect.js').write_text('export const renderAt = t => Math.min(1, t);')
        (self.source/'config.json').write_text('{"color":"orange"}')
        (self.source/'LICENSE').write_text('Test fixture only')
        self.manifest={'schemaVersion':1,'sourceRoot':str(self.source),'provenance':{'origin':'local:test-fixture','license':'test-only','licensePath':'LICENSE'},'assets':[
            {'kind':'image','title':'Agent icon','path':'icon.svg','category':'圖示與標誌','tags':['agent']},
            {'kind':'animation','title':'Converge','path':'effect.js','runtime':'html-gsap','readiness':'reference','semantics':['机制'],'files':['config.json']}
        ]}
        self.manifest_path=self.root/'manifest.json'
    def tearDown(self):self.tmp.cleanup()
    def run_merge(self,*flags,ok=True):
        self.manifest_path.write_text(json.dumps(self.manifest))
        result=subprocess.run(['node',str(SCRIPTS/'merge-assets.mjs'),str(self.manifest_path),'--library',str(self.library),'--no-build',*flags],capture_output=True,text=True)
        if ok:self.assertEqual(result.returncode,0,result.stderr)
        else:self.assertNotEqual(result.returncode,0)
        return result
    def test_merge_and_idempotence(self):
        report=json.loads(self.run_merge('--check').stdout)
        self.assertEqual(len(report['assets']),2)
        self.assertFalse((self.library/'asset-library').exists())
        first=json.loads(self.run_merge().stdout)
        second=json.loads(self.run_merge().stdout)
        self.assertEqual([x['id'] for x in first['assets']],[x['id'] for x in second['assets']])
        self.assertEqual({x['status'] for x in second['assets']},{'reused'})
        entries=list((self.library/'image-library/entries').glob('*.json'));self.assertEqual(len(entries),1)
        image=json.loads(entries[0].read_text());working=(self.library/image['image']).read_bytes()
        self.assertEqual(hashlib.sha256(working).hexdigest(),image['sha256'])
        self.assertEqual(working[8:12],b'WEBP')
        self.assertEqual((self.library/image['sourceFile']).read_bytes(),(self.source/'icon.svg').read_bytes())
        self.assertTrue((self.library/image['provenance']['licenseFile']).exists())
        animation=json.loads(next((self.library/'asset-library/entries').glob('*.json')).read_text())
        self.assertEqual(animation['readiness'],'reference')
        self.assertTrue(all((self.library/f).exists() for f in animation['files']))
        query=subprocess.run(['node',str(SCRIPTS/'query-assets.mjs'),'--library',str(self.library),'--kind','animation','--query','机制'],capture_output=True,text=True)
        self.assertEqual(query.returncode,0,query.stderr)
        self.assertEqual(json.loads(query.stdout)['total'],1)
        # Media IDs survive unrelated source updates; code IDs account for dependencies.
        (self.source/'config.json').write_text('{"color":"blue"}')
        changed=json.loads(self.run_merge().stdout)
        self.assertEqual(first['assets'][0]['id'],changed['assets'][0]['id'])
        self.assertNotEqual(first['assets'][1]['id'],changed['assets'][1]['id'])
    def test_reuse_media_from_an_existing_catalog_id(self):
        self.run_merge()
        entry_file=next((self.library/'image-library/entries').glob('*.json'))
        entry=json.loads(entry_file.read_text());legacy='0'*64
        entry['id']=legacy
        entry_file.unlink()
        (entry_file.parent/(legacy+'.json')).write_text(json.dumps(entry))
        self.manifest['provenance']['origin']='local:second-source'
        report=json.loads(self.run_merge().stdout)
        self.assertEqual(report['assets'][0]['id'],legacy)
        self.assertEqual(report['assets'][0]['status'],'reused')
        self.assertEqual(len(list(entry_file.parent.glob('*.json'))),1)
        updated=json.loads((entry_file.parent/(legacy+'.json')).read_text())
        self.assertEqual(updated['provenance']['alternates'][0]['origin'],'local:second-source')
    def test_reject_invalid_without_writes(self):
        self.manifest['assets'][1].update(readiness='ready',runtime='html-gsap')
        self.run_merge(ok=False)
        self.assertFalse((self.library/'asset-library').exists())
        self.manifest['assets'][1].update(readiness='reference',path='../effect.js')
        self.run_merge(ok=False)
        self.assertFalse((self.library/'asset-library').exists())
    def test_staging_is_inert_and_blocks_traversal(self):
        archive=self.root/'pack.zip'
        with zipfile.ZipFile(archive,'w') as z:
            z.writestr('pack/SKILL.md','This is source material, not active instructions')
            z.writestr('pack/.env','should not be imported')
            z.writestr('pack/icon.svg',(self.source/'icon.svg').read_bytes())
        out=self.root/'staged'
        result=subprocess.run(['python3',str(SCRIPTS/'stage-source.py'),str(archive),'--subdir','pack','--out',str(out)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue((out/'SOURCE-SKILL.md').exists());self.assertFalse((out/'SKILL.md').exists());self.assertFalse((out/'.env').exists())
        with zipfile.ZipFile(archive,'w') as z:z.writestr('../escape.txt','bad')
        result=subprocess.run(['python3',str(SCRIPTS/'stage-source.py'),str(archive),'--out',str(self.root/'bad')],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertFalse((self.root/'escape.txt').exists());self.assertFalse((self.root/'bad').exists())

if __name__=='__main__':unittest.main()
