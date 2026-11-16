#!/usr/bin/env python3
"""Restore pinned runtime/model assets for Books. No user text is sent anywhere."""
import hashlib, pathlib, tarfile, urllib.request, tempfile, argparse
ROOT=pathlib.Path(__file__).resolve().parent.parent
FILES=[
 ('https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.40/sherpa-onnx-1.12.40.aar','android/app/libs/sherpa-onnx-1.12.40.aar','a7699d6a2e638a38791b2459cb0099c7577e6e5fca6b8ae916742c872a618b82'),
 ('https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2',None,'72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653')]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model',action='store_true',help='Also fetch optional model data for development; not packaged into the APK')
args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='books-voices-') as temp:
 for url,destination,sha in FILES:
  if destination is None and not args.model:continue
  target=ROOT/destination if destination else pathlib.Path(temp)/'model.tar.bz2'
  target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():urllib.request.urlretrieve(url,target)
  if hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise RuntimeError('SHA-256 mismatch: '+str(target))
  if not destination:
   assets=ROOT/'android/app/voice-assets';assets.mkdir(parents=True,exist_ok=True)
   with tarfile.open(target) as archive:archive.extractall(assets,filter='data')
  print('Verified:',url)
