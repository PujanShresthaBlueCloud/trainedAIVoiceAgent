"""mulaw <-> PCM16 conversion utilities."""
import struct
import base64

MULAW_BIAS = 0x84
MULAW_CLIP = 32635

_mulaw_decode_table = [
    -32124,-31100,-30076,-29052,-28028,-27004,-25980,-24956,
    -23932,-22908,-21884,-20860,-19836,-18812,-17788,-16764,
    -15996,-15484,-14972,-14460,-13948,-13436,-12924,-12412,
    -11900,-11388,-10876,-10364,-9852,-9340,-8828,-8316,
    -7932,-7676,-7420,-7164,-6908,-6652,-6396,-6140,
    -5884,-5628,-5372,-5116,-4860,-4604,-4348,-4092,
    -3900,-3772,-3644,-3516,-3388,-3260,-3132,-3004,
    -2876,-2748,-2620,-2492,-2364,-2236,-2108,-1980,
    -1884,-1820,-1756,-1692,-1628,-1564,-1500,-1436,
    -1372,-1308,-1244,-1180,-1116,-1052,-988,-924,
    -876,-844,-812,-780,-748,-716,-684,-652,
    -620,-588,-556,-524,-492,-460,-428,-396,
    -372,-356,-340,-324,-308,-292,-276,-260,
    -244,-228,-212,-196,-180,-164,-148,-132,
    -120,-112,-104,-96,-88,-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,0,
    32124,31100,30076,29052,28028,27004,25980,24956,
    23932,22908,21884,20860,19836,18812,17788,16764,
    15996,15484,14972,14460,13948,13436,12924,12412,
    11900,11388,10876,10364,9852,9340,8828,8316,
    7932,7676,7420,7164,6908,6652,6396,6140,
    5884,5628,5372,5116,4860,4604,4348,4092,
    3900,3772,3644,3516,3388,3260,3132,3004,
    2876,2748,2620,2492,2364,2236,2108,1980,
    1884,1820,1756,1692,1628,1564,1500,1436,
    1372,1308,1244,1180,1116,1052,988,924,
    876,844,812,780,748,716,684,652,
    620,588,556,524,492,460,428,396,
    372,356,340,324,308,292,276,260,
    244,228,212,196,180,164,148,132,
    120,112,104,96,88,80,72,64,56,48,40,32,24,16,8,0,
]


def _encode_mulaw_sample(sample: int) -> int:
    sign = (sample >> 8) & 0x80
    if sign:
        sample = -sample
    if sample > MULAW_CLIP:
        sample = MULAW_CLIP
    sample += MULAW_BIAS
    exponent = 7
    mask = 0x4000
    for _ in range(8):
        if sample & mask:
            break
        exponent -= 1
        mask >>= 1
    mantissa = (sample >> (exponent + 3)) & 0x0F
    return ~(sign | (exponent << 4) | mantissa) & 0xFF


def pcm16_to_mulaw(pcm_data: bytes) -> bytes:
    samples = struct.unpack(f"<{len(pcm_data) // 2}h", pcm_data)
    return bytes(_encode_mulaw_sample(s) for s in samples)


def mulaw_to_pcm16(mulaw_data: bytes) -> bytes:
    samples = [_mulaw_decode_table[b] for b in mulaw_data]
    return struct.pack(f"<{len(samples)}h", *samples)


def resample_linear(data: bytes, from_rate: int, to_rate: int) -> bytes:
    if from_rate == to_rate:
        return data
    samples = struct.unpack(f"<{len(data) // 2}h", data)
    ratio = from_rate / to_rate
    new_len = int(len(samples) / ratio)
    resampled = []
    for i in range(new_len):
        src_idx = i * ratio
        idx = int(src_idx)
        frac = src_idx - idx
        if idx + 1 < len(samples):
            val = samples[idx] * (1 - frac) + samples[idx + 1] * frac
        else:
            val = samples[idx] if idx < len(samples) else 0
        resampled.append(int(val))
    return struct.pack(f"<{len(resampled)}h", *resampled)


def base64_mulaw_to_pcm16(b64_data: str, from_rate: int = 8000, to_rate: int = 16000) -> bytes:
    mulaw_bytes = base64.b64decode(b64_data)
    pcm = mulaw_to_pcm16(mulaw_bytes)
    if from_rate != to_rate:
        pcm = resample_linear(pcm, from_rate, to_rate)
    return pcm


def pcm16_to_base64_mulaw(pcm_data: bytes, from_rate: int = 16000, to_rate: int = 8000) -> str:
    if from_rate != to_rate:
        pcm_data = resample_linear(pcm_data, from_rate, to_rate)
    mulaw_bytes = pcm16_to_mulaw(pcm_data)
    return base64.b64encode(mulaw_bytes).decode("ascii")
