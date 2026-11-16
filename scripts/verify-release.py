"""Verify release APK architectures, assets, signing and native alignment."""
import hashlib,json,os,re,subprocess,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
os.chdir(root)
version=json.loads(Path('package.json').read_text())['version']
sdk=Path(os.environ.get('ANDROID_HOME','/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk'))
build_tools=sorted((sdk/'build-tools').iterdir())[-1]
os.environ.setdefault('JAVA_HOME','/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/java/jdk-17.0.20.1+1')
os.environ['PATH']=os.environ['JAVA_HOME']+'/bin:'+os.environ['PATH']
signer='0a29c9ee3ee09ee4527a2ea6726ada045d3d376ffd88e9d973731bf74a24a982'
checks=[]
for label,abi in [('debug','arm64-v8a'),('32bit','armeabi-v7a'),('x86_64','x86_64')]:
 apk=Path(f'releases/Books-{version}-{label}.apk')
 with zipfile.ZipFile(apk) as z:
  files=z.namelist();libs=[n for n in files if n.startswith('lib/') and n.endswith('.so')]
  assert {n.split('/')[1] for n in libs}=={abi}
  assert not any('.onnx' in n or n.startswith('assets/kokoro') or n.endswith('voices.bin') for n in files)
  count=0
  for f in Path('dist').rglob('*'):
   if f.is_file():assert z.read('assets/'+str(f.relative_to('dist')))==f.read_bytes(),str(f);count+=1
  compressed={};alignments=[]
  for lib in libs:
   info=z.getinfo(lib);assert info.compress_type==zipfile.ZIP_DEFLATED;compressed[lib]=info.compress_size
   with tempfile.NamedTemporaryFile() as temp:
    temp.write(z.read(lib));temp.flush()
    readelf=subprocess.check_output(['readelf','-lW',temp.name],text=True)
    aligns=[int(line.split()[-1],16) for line in readelf.splitlines() if line.strip().startswith('LOAD ')]
    assert aligns and all(a>=16384 for a in aligns),(lib,aligns)
    alignments.append({'library':lib,'loadAlignments':aligns})
 subprocess.run([str(build_tools/'zipalign'),'-c','-P','16','4',str(apk)],check=True,stdout=subprocess.DEVNULL)
 cert=subprocess.check_output([str(build_tools/'apksigner'),'verify','--print-certs',str(apk)],text=True)
 assert signer in cert
 meta=subprocess.check_output([str(build_tools/'aapt'),'dump','badging',str(apk)],text=True)
 assert f"versionName='{version}'" in meta and "name='app.books.reader'" in meta
 checks.append({'file':str(apk),'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'abi':abi,'modelAssetsAbsent':True,'webAssetsMatchBuild':True,'compressedLibraries':compressed,'alignment':alignments,'signerMatchesPrevious':True,'webAssetsCount':count})
 print('PASS',apk,apk.stat().st_size,'bytes')
path=Path(f'docs/verification-{version}/artifact.json');path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(checks,indent=2)+'\n')
