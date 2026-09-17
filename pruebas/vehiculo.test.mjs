// ABM de vehiculos del conductor.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { api, cerrarApi, crearUsuario, crearVehiculo, levantarApi } from './ayuda.mjs';

before(() => levantarApi('vehiculo'));
after(() => cerrarApi());

describe('vehiculos', () => {
  test('el primero queda predeterminado y el segundo no', async () => {
    const conductor = await crearUsuario();

    const primero = await crearVehiculo(conductor.token);
    assert.equal(primero.predeterminado, true);

    const segundo = await crearVehiculo(conductor.token);
    assert.equal(segundo.predeterminado, false);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    assert.equal(lista.estado, 200);
    assert.equal(lista.datos.vehiculos.length, 2);
  });

  test('marcar otro como predeterminado libera al anterior', async () => {
    const conductor = await crearUsuario();
    const primero = await crearVehiculo(conductor.token);
    const segundo = await crearVehiculo(conductor.token);

    const cambio = await api('PATCH', `/vehiculos/${segundo.id_vehiculo}`, {
      token: conductor.token,
      body: { predeterminado: true },
    });
    assert.equal(cambio.estado, 200);
    assert.equal(cambio.datos.vehiculo.predeterminado, true);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    const anterior = lista.datos.vehiculos.find((v) => v.id_vehiculo === primero.id_vehiculo);
    assert.equal(anterior.predeterminado, false);
  });

  test('no se repite la patente', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const repetida = await api('POST', '/vehiculos', {
      token: conductor.token,
      body: { patente: vehiculo.patente, id_tipo_vehiculo: 1 },
    });
    assert.equal(repetida.estado, 409);
  });

  test('edita marca y modelo', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const { estado, datos } = await api('PATCH', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: conductor.token,
      body: { marca: 'Renault', modelo: 'Sandero' },
    });

    assert.equal(estado, 200);
    assert.equal(datos.vehiculo.marca, 'Renault');
    assert.equal(datos.vehiculo.modelo, 'Sandero');
  });

  test('la baja es logica: deja de listarse', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const baja = await api('DELETE', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: conductor.token,
    });
    assert.ok(baja.estado === 200 || baja.estado === 204, `respondio ${baja.estado}`);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    assert.equal(
      lista.datos.vehiculos.some((v) => v.id_vehiculo === vehiculo.id_vehiculo),
      false,
    );
  });

  test('otro conductor no puede tocarlo', async () => {
    const duenio = await crearUsuario();
    const ajeno = await crearUsuario();
    const vehiculo = await crearVehiculo(duenio.token);

    const edicion = await api('PATCH', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: ajeno.token,
      body: { marca: 'Robada' },
    });
    assert.equal(edicion.estado, 404);
  });

  test('el catalogo de tipos es publico', async () => {
    const { estado, datos } = await api('GET', '/vehiculos/tipos');
    assert.equal(estado, 200);
    assert.ok(datos.tipos.length >= 3);
  });
});
