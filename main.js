var getIPsFromInput = function(input) {
    var ip_regexp = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    var ip_regexp_rfc1918 = /^(?:10|127|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\..*/;
    var ips = input.trim().split("\n")
        .map(function(elem) {
            if (elem.indexOf('traceroute') >= 0) {
                return null;
            }
            var m = elem.match(ip_regexp);
            if (m){
                return m[0];
            } else {
                return null;
            }
        })
        .filter(function(elem) {
            return elem && !elem.match(ip_regexp_rfc1918);
        });
    return ips;
};

var getInfoFromIPs = function(ips, func) {
    var post_data = ips.map(function(elem) {
        return {query: elem};
    });
    var info = [];
    $.post('//ip-api.com/batch', JSON.stringify(post_data), function(resp) {
        info = resp.map(function(elem, index) {
            return {
                num: index + 1,
                ip: elem.query,
                country: elem.country,
                region: elem.regionName,
                city: elem.city,
                lat: elem.lat,
                lon: elem.lon
            };
        });
        func(info);
    }, 'json');
};

var getLocsFromInfo = function(info) {
    var data = info.filter(function(elem) {
        return elem.region != "";
    });
    var locs = [];
    var last_lat = 0, last_lon = 0;
    for (var i = 0; i < data.length; i++) {
        var elem = data[i];
        var lat = elem.lat;
        var lon = elem.lon;
        if (!(lat == last_lat && lon == last_lon)) {
            locs.push({
                // label: String(elem[0]),
                lat: lat,
                lon: lon,
                html: elem.country + ', ' + elem.region + ', ' + elem.city
            });
        }
        last_lat = lat;
        last_lon = lon;
    }
    return locs;
};

$(function() {
    var table = $('#table').DataTable({
        info: false,
        paging: false,
        searching: false,
        columns: [
            { data: 'num' },
            { data: 'ip' },
            { data: 'country' },
            { data: 'region' },
            { data: 'city' },
            { data: 'lat' },
            { data: 'lon' }
        ]
    });

    var map = new Maplace({
        locations: [{
            lat: 0,
            lon: -180,
            zoom: 2
        }],
        type: 'polyline',
        stroke_options: {
            icons: [{
                icon: {path: google.maps.SymbolPath.FORWARD_OPEN_ARROW},
                offset: '20px',
                repeat: '300px'
            }],
            strokeColor: '#FF0000'
        }
    }).Load();

    var locations = [];
    $('#form').submit(function(event) {
        event.preventDefault();
        table.clear().draw(false);
        var input = $(this).find('textarea').val();
        var ips = getIPsFromInput(input);
        if (ips.length == 0) {
            map.Load({
                locations: [{
                    lat: 0,
                    lon: -180,
                    zoom: 2
                }]});
        } else {
            getInfoFromIPs(ips, function(info) {
                table.rows.add(info).draw(false);
                locations = getLocsFromInfo(info);
                map.SetLocations(locations, true);
            });
        }
    });

    $('#table tbody').on('click', 'tr', function() {
        var data = table.row(this).data();
        var lat = data.lat;
        var lon = data.lon;
        var index;
        for (index = 0; index < locations.length; index++) {
            if (lat == locations[index].lat && lon == locations[index].lon) {
                break;
            }
        }
        map.ViewOnMap(index + 1);
    });
});
