function CreateWindow(map_name, dimec, dimec_name){

    let TILE_LAYER_URL = 'https://api.mapbox.com/v4/mapbox.streets/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiamhlcndpZzEiLCJhIjoiY2lrZnB2MnE4MDAyYnR4a2xua3pramprNCJ9.7-wu_YjNrTFsEE0mcUP06A';

    let plotOpen = false;

    var map = L.map(map_name, {
        minZoom: 3,
        maxZoom: 10,
        center: [40, -100],
        zoom: 5,
    });

    const tileLayer = L.tileLayer(TILE_LAYER_URL)
        .addTo(map);
    const topologyLayer = L.topologyLayer()
        .addTo(map);

    const contourLayer = L.contourLayer()
        .addTo(map);

    const communicationLayer = L.communicationLayer()
        .addTo(map);

    const simTimeBox = L.simTimeBox({ position: 'topright'  })
        .addTo(map);

    const thetaButton = L.easyButton('<span>&Theta;</span>', function(btn, map){
        contourLayer.showVariable("theta");
        contourLayer.updateRange(-1, 1);
    });
    const voltageButton = L.easyButton('<span>V</span>', function(btn, map){
        contourLayer.showVariable("V");
        contourLayer.updateRange(0.8, 1.2);
    });
    const freqButton = L.easyButton('<span><i>f</i></span>', function(btn, map){
        contourLayer.showVariable("freq");
        contourLayer.updateRange(0.9995, 1.0005);
    });

    const avfButtons= [thetaButton, voltageButton, freqButton];
    const avfBar = L.easyBar(avfButtons).addTo(map);

    const plotSelector = L.control.dialog({"initOpen": false})
        .setContent("<p>Hello! Welcome to your nice new dialog box!</p>")
        .addTo(map);

    const plotButton = L.easyButton('<span><i>p</i></span>', function(btn, map){
        if (plotOpen == false) {
            plotSelector.open();
            plotOpen = true;
        } else {
            plotSelector.close();
            plotOpen = false;
        }

    }).addTo(map);

    const lineSpec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
    "description": "Google's stock price over time.",
    "data": {"name": "table"},
    "mark": "line",
    "encoding": {
        "x": {"field": "t", "type": "quantitative"},
        "y": {"field": "voltage", "type": "quantitative"}
    }
    };

    (async () => {

    await dimec.ready;
    console.time(map_name);

    // plot
    const { view } = await vegaEmbed('#vis', lineSpec, {defaultStyle: true})

    const workspace = {};

    let sentHeader = false;
    for (;;) {
        const { name, value } = await dimec.sync();
        if (name !== 'Varvgs')
            console.log({ name, value });
        workspace[name] = value;

        if (!sentHeader && name === 'Idxvgs') {
            const busVoltageIndices = workspace.Idxvgs.Bus.V.typedArray;
            const busThetaIndices = workspace.Idxvgs.Bus.theta.typedArray;
            const busfreqIndices= workspace.Idxvgs.Bus.w_Busfreq.typedArray;

            const nBus = busVoltageIndices.length;

            // Build the idx list for simulator
            const variableAbsIndices = new Float64Array(nBus * 3);
            const variableRelIndices = {};

            for (let i=0; i<busVoltageIndices.length; ++i) {
                variableAbsIndices[i] = busVoltageIndices[i];
            }

            for (let i=0; i<busThetaIndices.length; ++i) {
                variableAbsIndices[nBus + i] = busThetaIndices[i];
            }
            for (let i=0; i<busfreqIndices.length; ++i) {
                variableAbsIndices[2*nBus + i] = busfreqIndices[i];
            }

            // Build internal idx list
            variableRelIndices["V"] = {"begin": 0, "end": nBus};
            variableRelIndices["theta"] = {"begin": nBus, "end": 2 * nBus};
            variableRelIndices["freq"] = {"begin": 2 * nBus, "end": 3 * nBus};

            // Update variable Range
            contourLayer.storeRelativeIndices(variableRelIndices);
            contourLayer.showVariable("freq");
            contourLayer.updateRange(0.9995, 1.0005);

            sentHeader = true;
            dimec.send_var('sim', dimec_name, {
                vgsvaridx: {
                    ndarray: true,
                    shape: [1, variableAbsIndices.length],
                    data: base64arraybuffer.encode(variableAbsIndices.buffer),
                },
            });

        } else if (name === 'DONE') {
            dimec.close();
            console.timeEnd(map_name);
        }

        topologyLayer.update(workspace);
        contourLayer.update(workspace);
        communicationLayer.update(workspace);
        if (workspace.Varvgs){
            simTimeBox.update(workspace.Varvgs.t.toFixed(2));
            view.insert("table", {"t": workspace.Varvgs.t, "voltage": workspace.Varvgs.vars.get(0, 0) }).run();
        }
    }
    })();

    return map;

}
