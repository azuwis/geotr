var clearSingle = function(obj) {
    if (obj && $.isFunction(obj.setMap)) {
        obj.setMap(null);
    }
}

var clearMap = function(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(function(elem) { clearSingle(elem); });
    } else {
        clearSingle(obj);
    }
}

var drawMap = function(points) {
    $('#map')
        .gmap3({
            zoom: 2,
            center: [0, -180]
        })
        .then(function(result){
            clearMap(this.get(-1));
            clearMap(this.get(-2));
        })
        .marker(points.map(function(elem, index) {
            return {
                label: String(index + 1),
                address: elem.address
            };
        }))
        .polyline(function(markers) {
            return {
                strokeColor: "#FF0000",
                strokeOpacity: 1.0,
                strokeWeight: 2,
                path: markers.map(function(elem) { return elem.position; })
            };
        })
        .fit();
}

$(function() {
    $('#map')
        .gmap3({
            zoom: 2,
            center: [0, -180]
        });
    $('#form').submit(function(event) {
        var input = $(this).find('textarea').val();
        var points = input.trim().split("\n").map(function(elem) { return {address: elem}; });
        drawMap(points);
        event.preventDefault();
    });
});
