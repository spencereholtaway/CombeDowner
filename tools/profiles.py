"""Heights along a line that has to rise and fall like something built (a road, a railway), not
like the survey's ground under it: shared by tools/prep_map.py (the roads) and tools/railway.py.

- carry_profile: each bridge or tunnel carried straight from one end to the other, its ends taken
  from the line's own slope a little way out, where the survey is clear of the gap it has for the
  bridge (the bridge taken out of it and the bank put in).
- ease_grades: no stretch steeper than it may be, by moving the two ends of a too-steep stretch
  towards each other (the fixed points stay put).
- ease_kinks: no sudden change of gradient from one stretch to the next (a point between two
  stretches whose slopes differ by more than a little is brought onto the line between its
  neighbours, which never makes either steeper).
"""

APPROACH = 10   # points back from a bridge's end over which the survey may have the line dropping into the gap


def carry_profile(z, d, on, free, fixed=(None, None), least=None, fit=True):
    """Carry each stretch of points marked on (a bridge, a tunnel) straight from one end to the
    other, in place. The survey's ground drops away into the gap over the last few dozen metres
    before a bridge (the bridge taken out of it and the bank put in), where the road doesn't: so
    each end is taken from the road's own slope a little way out (12 to 40 m), where the survey
    is clear of the gap, and the last few metres ramp up from the survey to it (never down, and
    never held level: on a hillside the highest point nearby is far up the slope, and the road
    would stand on a shelf and then plunge). d: distance along; free: points whose height may be
    changed; fixed: the heights a stretch running off either end must meet there (or None);
    least: the lowest each point's deck may be (over the canal, clear of a boat): where the
    straight line doesn't clear it, the deck rises over it in a smooth crest, out over its approaches. fit False:
    a tunnel's, whose ends are taken as they are (the survey rises over a tunnel, onto the hill
    over it, where over a bridge it dips)."""
    n, m, out = len(z), 0, 0
    def end(i, step):
        win = [j for j in range(i - step * APPROACH, i - step * 2 + step, step) if 0 <= j < n and free[j]]
        near = [z[j] for j in range(min(i, i - step * APPROACH), max(i, i - step * APPROACH) + 1) if 0 <= j < n and free[j]] or [z[i]]
        h = z[i]
        if fit and len(win) >= 3:
            xs, ys = [d[j] for j in win], [z[j] for j in win]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sum((x - mx) ** 2 for x in xs) or 1)
            h = max(z[i], min(max(near), my + slope * (d[i] - mx)))
            r0 = i - step * 3
            if 0 <= r0 < n and free[r0]:
                for j in range(r0 + step, i, step):
                    if free[j]: z[j] = max(z[j], z[r0] + (h - z[r0]) * (d[j] - d[r0]) / ((d[i] - d[r0]) or 1))
        return h
    while m < n:
        if not on[m]: m += 1; continue
        e = m
        while e + 1 < n and on[e + 1]: e += 1
        i0, i1 = m - 1, e + 1
        za = end(i0, 1) if i0 >= 0 else (fixed[0] if fixed[0] is not None else z[m])
        zb = end(i1, -1) if i1 < n else (fixed[1] if fixed[1] is not None else z[e])
        if i0 >= 0 and free[i0]: z[i0] = za
        if i1 < n and free[i1]: z[i1] = zb
        da, db = d[max(0, i0)], d[min(n - 1, i1)]
        for j in range(m, e + 1): z[j] = za + (zb - za) * (d[j] - da) / ((db - da) or 1)
        if least is not None:
            # a hump over what has to be cleared, as a smooth crest: each point that's too low is
            # lifted, and the lift eases away either side over a run long enough that the road
            # never climbs it steeper than about 1 in 16, out over its approaches too (not a step
            # up onto a level shelf and a step down off it)
            lifts = [(i, least[i] - z[i]) for i in range(m, e + 1) if least[i] > z[i]]
            if lifts:
                add = [0.0] * n
                for i, dz in lifts:
                    R = max(8.0, dz * 24)
                    for j in range(n):
                        x = abs(d[j] - d[i])
                        if x >= R or not (free[j] or m <= j <= e): continue
                        t = x / R
                        add[j] = max(add[j], dz * (1 - t * t * (3 - 2 * t)))
                for j in range(n): z[j] += add[j]
        out += 1
        m = e + 1
    return out


def ease_grades(z, d, lim, fixed, rounds=40):
    """Bring each stretch m..m+1 of heights z (at distances d along) within lim[m] of level (a rise
    over its length), in place, moving the free ends of a stretch that's too steep towards each
    other; fixed points stay where they are."""
    n = len(z)
    for _ in range(rounds):
        moved = False
        for m in range(n - 1):
            dz = z[m + 1] - z[m]
            over = abs(dz) - lim[m]
            if over <= 0.01: continue
            fa, fb = fixed[m], fixed[m + 1]
            if fa and fb: continue
            s = 1 if dz > 0 else -1
            if fa: z[m + 1] -= s * over
            elif fb: z[m] += s * over
            else: z[m] += s * over / 2; z[m + 1] -= s * over / 2
            moved = True
        if not moved: break


def ease_kinks(z, d, fixed, most=0.12, rounds=30):
    """Bring each free point whose two stretches' slopes differ by more than most part of the way
    onto the straight line between its neighbours, in place."""
    n = len(z)
    for _ in range(rounds):
        moved = False
        for m in range(1, n - 1):
            if fixed[m]: continue
            d1, d2 = d[m] - d[m - 1], d[m + 1] - d[m]
            if d1 < 0.5 or d2 < 0.5: continue
            if abs((z[m + 1] - z[m]) / d2 - (z[m] - z[m - 1]) / d1) <= most: continue
            line = (z[m - 1] * d2 + z[m + 1] * d1) / (d1 + d2)
            z[m] += (line - z[m]) * 0.6
            moved = True
        if not moved: break
