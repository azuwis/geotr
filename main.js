$(function() {
    var table = $('table').DataTable({
        "info": false,
        "paging": false,
        "searching": false
    });

    var map = new Maplace({
        locations: [{
            lat: 0,
            lon: -180,
            zoom: 2
        }],
        type: 'polyline',
        stroke_options: {
            strokeColor: '#FF0000'
        }
    }).Load();

    var ip_regexp = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    var ip_regexp_rfc1918 = /^(?:10|127|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\..*/;
    $('#form').submit(function(event) {
        event.preventDefault();
        var input = $(this).find('textarea').val();
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
        table.clear().draw(false);
        ips.forEach(function(elem, index) {
            $.get('//ipinfo.io/' + elem + '/geo?callback=?', function(resp){
                var [lat, lon] = resp.loc.split(',');
                var row = [
                    index + 1,
                    resp.ip,
                    resp.country,
                    resp.region,
                    resp.city,
                    lat,
                    lon
                ];
                table.row.add(row).draw(false);
                if (ips.length == table.data().length) {
                    var data = table.data();
                    data = data
                        .sort(function(x, y) {
                            return x[0] - y[0];
                        })
                        .filter(function(elem) {
                            return elem[3] != "";
                        });
                    var locations = data.map(function(elem) {
                        return {
                            lat: elem[5],
                            lon: elem[6],
                            html: elem.slice(2 ,5).join(', ')
                        };
                    });
                    map.SetLocations(locations, true);
                }
            }, 'jsonp');
        });
    });
});
