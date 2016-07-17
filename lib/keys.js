module.exports = Object.keys || function (obj) {//返回所有键（数组）,有的自带有keys方法，有的没有就要自己写个函数来实现
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};
