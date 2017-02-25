var points = [
    {
        address: '浙江, 杭州',
    },
    {
        address: '上海',
    }
];

$(function() {
    $('#map')
        .gmap3({
            zoom: 2,
            center: [0, -180]
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
                path: markers.map(function(elem){ return elem.position; })
            };
        })
        .fit();
});
