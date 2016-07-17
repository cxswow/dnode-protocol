module.exports = function forEach (xs, f) {
    if (xs.forEach) return xs.forEach(f)//对自带forEach方法的对象，直接调用
    for (var i = 0; i < xs.length; i++) {//对不带有forEach方法的对象，
        f.call(xs, xs[i], i);
    }
}
